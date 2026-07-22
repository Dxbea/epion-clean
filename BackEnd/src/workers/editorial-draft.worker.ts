import { fileURLToPath } from 'node:url';
import { DelayedError, UnrecoverableError, Worker, type ConnectionOptions, type Job, type Processor, type Queue } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { OpenAIEditorialClaimCritic, OpenAIEditorialDraftGenerator } from '../lib/editorial-draft/draft-generator.js';
import { EditorialDraftMetrics } from '../lib/editorial-draft/draft-metrics.js';
import {
  buildEditorialDraftDeadLetterJobId,
  buildEditorialDraftJobId,
  createEditorialDraftQueues,
  createEditorialDraftRedisConnection,
  EDITORIAL_DRAFT_DLQ_JOB_NAME,
  EDITORIAL_DRAFT_JOB_ATTEMPTS,
  EDITORIAL_DRAFT_QUEUE_NAME,
  type EditorialDraftDeadLetterData,
  type EditorialDraftJobData,
} from '../lib/editorial-draft/draft-queue.js';
import { generateControlledEditorialDraft, resolveEditorialDraftConfig } from '../lib/editorial-draft/draft-service.js';
import { EDITORIAL_DRAFT_REDIS_KILL_SWITCH_KEY, resolveEditorialDraftRuntimeFlags, type EditorialDraftRuntimeFlags } from '../lib/editorial-draft/runtime-flags.js';
import { EDITORIAL_CRITIC_PROMPT_VERSION, EDITORIAL_DRAFT_PROMPT_VERSION, EDITORIAL_DRAFT_VERSION } from '../lib/editorial-draft/types.js';
import { acquireRedisLock, isRedisKillSwitchActive, type DiscoveryRedis } from '../lib/discovery/redis-lock.js';
import logger from '../lib/logger.js';

const workerLog = logger.child({ module: 'EditorialDraftWorker' });
const LOCK_PREFIX = 'epion:editorial-draft:brief-lock:';

export interface EditorialDraftProcessorDependencies {
  client: PrismaClient;
  redis: DiscoveryRedis;
  flags: EditorialDraftRuntimeFlags;
  metrics: EditorialDraftMetrics;
  generateDraft?: typeof generateControlledEditorialDraft;
}

export function createEditorialDraftProcessor(dependencies: EditorialDraftProcessorDependencies): Processor<EditorialDraftJobData> {
  return async (job) => {
    if (dependencies.flags.killSwitch || await isRedisKillSwitchActive(dependencies.redis, EDITORIAL_DRAFT_REDIS_KILL_SWITCH_KEY)) {
      return delayJob(job, dependencies.flags.pausedJobDelayMs, 'Editorial draft kill switch is active');
    }
    try {
      if (!job.data.briefId.trim()) throw new Error('briefId is required');
      if (job.data.draftVersion !== EDITORIAL_DRAFT_VERSION || job.data.promptVersion !== EDITORIAL_DRAFT_PROMPT_VERSION || job.data.criticPromptVersion !== EDITORIAL_CRITIC_PROMPT_VERSION) throw new Error('Unsupported editorial draft version');
      if (!['MANUAL', 'PROD_SHADOW_RETRY'].includes(job.data.trigger)) throw new Error('Unsupported editorial draft trigger');
      if (job.data.trigger === 'PROD_SHADOW_RETRY' && !job.data.retryKey?.trim()) throw new Error('Production-shadow retry requires retryKey');
      if (!job.data.generatorModel.trim() || !job.data.criticModel.trim()) throw new Error('Editorial draft models are required');
      if (Number.isNaN(new Date(job.data.requestedAt).getTime())) throw new Error('requestedAt must be a valid ISO date');
      resolveEditorialDraftConfig(job.data.config);
      if (job.id !== buildEditorialDraftJobId(job.data)) throw new Error('Editorial draft job identity does not match its payload');
    } catch (error) {
      throw new UnrecoverableError(errorMessage(error));
    }
    const lock = await acquireRedisLock(dependencies.redis, `${LOCK_PREFIX}${job.data.briefId}`, dependencies.flags.runLockTtlMs);
    if (!lock) {
      dependencies.metrics.increment('lockMisses');
      return delayJob(job, 30_000, 'Editorial draft brief lock is held');
    }
    const heartbeat = startHeartbeat(lock, dependencies.flags.runLockTtlMs);
    dependencies.metrics.increment('jobsStarted');
    try {
      const generateDraft = dependencies.generateDraft ?? generateControlledEditorialDraft;
      const result = await generateDraft(dependencies.client, job.data.briefId, {
        config: job.data.config,
        retryKey: job.data.retryKey,
        generator: new OpenAIEditorialDraftGenerator(job.data.generatorModel),
        critic: new OpenAIEditorialClaimCritic(job.data.criticModel),
      });
      dependencies.metrics.increment('jobsSucceeded');
      dependencies.metrics.record(result);
      return result;
    } catch (error) {
      dependencies.metrics.increment('jobsFailed');
      throw error;
    } finally {
      clearInterval(heartbeat);
      await lock.release().catch((error) => workerLog.warn('Failed to release editorial draft lock', { error: errorMessage(error) }));
    }
  };
}

async function delayJob(job: Job<EditorialDraftJobData>, delayMs: number, reason: string): Promise<never> {
  await job.moveToDelayed(Date.now() + delayMs, job.token);
  throw new DelayedError(reason);
}

function startHeartbeat(lock: { extend(ttlMs: number): Promise<boolean> }, ttlMs: number): NodeJS.Timeout {
  const timer = setInterval(() => lock.extend(ttlMs).catch((error) => workerLog.error('Failed to renew editorial draft lock', { error: errorMessage(error) })), Math.max(1_000, Math.floor(ttlMs / 3)));
  timer.unref();
  return timer;
}

export async function startEditorialDraftWorker() {
  const flags = resolveEditorialDraftRuntimeFlags();
  if (!flags.enabled || flags.killSwitch) {
    workerLog.warn('Editorial draft worker remains disabled', { enabled: flags.enabled, killSwitch: flags.killSwitch });
    return null;
  }
  const connection = createEditorialDraftRedisConnection();
  const queues = createEditorialDraftQueues(connection as unknown as ConnectionOptions);
  const metrics = new EditorialDraftMetrics();
  const worker = new Worker<EditorialDraftJobData>(EDITORIAL_DRAFT_QUEUE_NAME, createEditorialDraftProcessor({ client: prisma, redis: connection as unknown as DiscoveryRedis, flags, metrics }), { connection: connection as unknown as ConnectionOptions, concurrency: flags.workerConcurrency });
  attachEvents(worker, queues.deadLetterQueue, metrics);
  workerLog.info('Controlled editorial draft worker started', { queue: EDITORIAL_DRAFT_QUEUE_NAME, concurrency: flags.workerConcurrency });
  return { worker, queues, metrics, async close() { await worker.close(); await queues.draftQueue.close(); await queues.deadLetterQueue.close(); await connection.quit(); } };
}

function attachEvents(worker: Worker<EditorialDraftJobData>, dlq: Queue<EditorialDraftDeadLetterData>, metrics: EditorialDraftMetrics): void {
  worker.on('completed', (job, result) => workerLog.info('Editorial draft job completed', { jobId: job.id, briefId: job.data.briefId, result, metrics: metrics.snapshot() }));
  worker.on('failed', (job, error) => {
    if (!job || !isTerminalEditorialDraftFailure(job, error)) return;
    dlq.add(EDITORIAL_DRAFT_DLQ_JOB_NAME, buildEditorialDraftDeadLetterData(job, error), { jobId: buildEditorialDraftDeadLetterJobId(job.id, job.attemptsMade) })
      .then(() => metrics.increment('jobsDeadLettered'))
      .catch((dlqError) => workerLog.error('Failed to write editorial draft dead-letter job', { error: errorMessage(dlqError) }));
  });
  worker.on('error', (error) => workerLog.error('Editorial draft worker error', { error: error.message }));
}

export function isTerminalEditorialDraftFailure(job: Pick<Job<EditorialDraftJobData>, 'attemptsMade' | 'opts'>, error: Error): boolean {
  return error.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? EDITORIAL_DRAFT_JOB_ATTEMPTS);
}

export function buildEditorialDraftDeadLetterData(job: Pick<Job<EditorialDraftJobData>, 'id' | 'data' | 'attemptsMade'>, error: Error, failedAt = new Date()): EditorialDraftDeadLetterData {
  return { ...job.data, originalJobId: job.id ?? null, failedAt: failedAt.toISOString(), attemptsMade: job.attemptsMade, error: error.message.slice(0, 1_000) };
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startEditorialDraftWorker().catch((error) => { workerLog.error('Editorial draft worker startup crashed', { error: errorMessage(error) }); process.exit(1); });
}
