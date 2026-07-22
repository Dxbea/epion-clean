import { fileURLToPath } from 'node:url';
import { DelayedError, UnrecoverableError, Worker, type ConnectionOptions, type Job, type Processor, type Queue } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { OpenAIEditorialBriefGenerator } from '../lib/editorial-brief/brief-generator.js';
import { EditorialBriefMetrics } from '../lib/editorial-brief/brief-metrics.js';
import {
  buildEditorialBriefDeadLetterJobId,
  buildEditorialBriefJobId,
  createEditorialBriefQueues,
  createEditorialBriefRedisConnection,
  EDITORIAL_BRIEF_DEAD_LETTER_JOB_NAME,
  EDITORIAL_BRIEF_JOB_ATTEMPTS,
  EDITORIAL_BRIEF_QUEUE_NAME,
  type EditorialBriefDeadLetterJobData,
  type EditorialBriefJobData,
} from '../lib/editorial-brief/brief-queue.js';
import { resolveEditorialBriefConfig, runEditorialBriefBatch } from '../lib/editorial-brief/dossier-service.js';
import {
  EDITORIAL_BRIEF_REDIS_KILL_SWITCH_KEY,
  resolveEditorialBriefRuntimeFlags,
  type EditorialBriefRuntimeFlags,
} from '../lib/editorial-brief/runtime-flags.js';
import { EDITORIAL_BRIEF_PROMPT_VERSION, EDITORIAL_DOSSIER_VERSION } from '../lib/editorial-brief/types.js';
import { acquireRedisLock, isRedisKillSwitchActive, type DiscoveryRedis } from '../lib/discovery/redis-lock.js';
import logger from '../lib/logger.js';

const workerLog = logger.child({ module: 'EditorialBriefWorker' });
const RUN_LOCK_PREFIX = 'epion:editorial-brief:run-lock:';

export interface EditorialBriefProcessorDependencies {
  client: PrismaClient;
  redis: DiscoveryRedis;
  flags: EditorialBriefRuntimeFlags;
  metrics: EditorialBriefMetrics;
  runBatch?: typeof runEditorialBriefBatch;
}

export function createEditorialBriefJobProcessor(
  dependencies: EditorialBriefProcessorDependencies,
): Processor<EditorialBriefJobData> {
  return async (job) => {
    if (
      dependencies.flags.killSwitch ||
      await isRedisKillSwitchActive(dependencies.redis, EDITORIAL_BRIEF_REDIS_KILL_SWITCH_KEY)
    ) {
      return delayJob(job, dependencies.flags.pausedJobDelayMs, 'Editorial brief kill switch is active');
    }
    try {
      if (!job.data.editorialRunId.trim()) throw new Error('editorialRunId is required');
      if (job.data.dossierVersion !== EDITORIAL_DOSSIER_VERSION) throw new Error('Unsupported dossier version');
      if (job.data.promptVersion !== EDITORIAL_BRIEF_PROMPT_VERSION) throw new Error('Unsupported prompt version');
      if (!job.data.generatorModel.trim()) throw new Error('generatorModel is required');
      validDate(job.data.requestedAt, 'requestedAt');
      resolveEditorialBriefConfig({ ...job.data.config, prodShadowControlled: job.data.prodShadowControlled === true });
      if (job.id !== buildEditorialBriefJobId(job.data)) throw new Error('Editorial brief job identity does not match its payload');
    } catch (error) {
      throw new UnrecoverableError(errorMessage(error));
    }

    const lock = await acquireRedisLock(
      dependencies.redis,
      `${RUN_LOCK_PREFIX}${job.data.editorialRunId}`,
      dependencies.flags.runLockTtlMs,
    );
    if (!lock) {
      dependencies.metrics.increment('runLockMisses');
      return delayJob(job, 30_000, 'Editorial brief run lock is held');
    }
    dependencies.metrics.increment('jobsStarted');
    const heartbeat = startLockHeartbeat(lock, dependencies.flags.runLockTtlMs);
    try {
      const runBatch = dependencies.runBatch ?? runEditorialBriefBatch;
      const result = await runBatch(dependencies.client, job.data.editorialRunId, {
        config: job.data.config,
        prodShadowControlled: job.data.prodShadowControlled === true,
        generator: new OpenAIEditorialBriefGenerator(job.data.generatorModel),
      });
      dependencies.metrics.increment('jobsSucceeded');
      dependencies.metrics.recordBatch(result);
      return result;
    } catch (error) {
      dependencies.metrics.increment('jobsFailed');
      throw error;
    } finally {
      clearInterval(heartbeat);
      await lock.release().catch((error) => workerLog.warn('Failed to release editorial brief lock', { error: errorMessage(error) }));
    }
  };
}

async function delayJob(job: Job<EditorialBriefJobData>, delayMs: number, reason: string): Promise<never> {
  await job.moveToDelayed(Date.now() + delayMs, job.token);
  throw new DelayedError(reason);
}

function startLockHeartbeat(lock: { extend(ttlMs: number): Promise<boolean> }, ttlMs: number): NodeJS.Timeout {
  const interval = setInterval(() => {
    lock.extend(ttlMs).catch((error) => workerLog.error('Failed to renew editorial brief lock', { error: errorMessage(error) }));
  }, Math.max(1_000, Math.floor(ttlMs / 3)));
  interval.unref();
  return interval;
}

export async function startEditorialBriefWorker() {
  const flags = resolveEditorialBriefRuntimeFlags();
  if (!flags.enabled || flags.killSwitch) {
    workerLog.warn('Editorial brief worker remains disabled', { enabled: flags.enabled, killSwitch: flags.killSwitch });
    return null;
  }
  const connection = createEditorialBriefRedisConnection();
  const queues = createEditorialBriefQueues(connection as unknown as ConnectionOptions);
  const metrics = new EditorialBriefMetrics();
  const worker = new Worker<EditorialBriefJobData>(
    EDITORIAL_BRIEF_QUEUE_NAME,
    createEditorialBriefJobProcessor({ client: prisma, redis: connection as unknown as DiscoveryRedis, flags, metrics }),
    { connection: connection as unknown as ConnectionOptions, concurrency: flags.workerConcurrency },
  );
  attachWorkerEvents(worker, queues.deadLetterQueue, metrics);
  workerLog.info('Editorial brief worker started in strict shadow mode', {
    queue: EDITORIAL_BRIEF_QUEUE_NAME,
    concurrency: flags.workerConcurrency,
  });
  return {
    worker, queues, metrics,
    async close() {
      await worker.close();
      await queues.briefQueue.close();
      await queues.deadLetterQueue.close();
      await connection.quit();
    },
  };
}

function attachWorkerEvents(
  worker: Worker<EditorialBriefJobData>,
  deadLetterQueue: Queue<EditorialBriefDeadLetterJobData>,
  metrics: EditorialBriefMetrics,
): void {
  worker.on('completed', (job, result) => workerLog.info('Editorial brief job completed', {
    jobId: job.id, editorialRunId: job.data.editorialRunId, result, metrics: metrics.snapshot(),
  }));
  worker.on('failed', (job, error) => {
    if (!job || !isTerminalEditorialBriefFailure(job, error)) return;
    const data = buildEditorialBriefDeadLetterData(job, error);
    deadLetterQueue.add(EDITORIAL_BRIEF_DEAD_LETTER_JOB_NAME, data, {
      jobId: buildEditorialBriefDeadLetterJobId(job.id, job.attemptsMade),
    }).then(() => metrics.increment('jobsDeadLettered')).catch((dlqError) =>
      workerLog.error('Failed to write editorial brief dead-letter job', { error: errorMessage(dlqError) }));
  });
  worker.on('error', (error) => workerLog.error('Editorial brief worker error', { error: error.message }));
}

export function isTerminalEditorialBriefFailure(
  job: Pick<Job<EditorialBriefJobData>, 'attemptsMade' | 'opts'>,
  error: Error,
): boolean {
  return error.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? EDITORIAL_BRIEF_JOB_ATTEMPTS);
}

export function buildEditorialBriefDeadLetterData(
  job: Pick<Job<EditorialBriefJobData>, 'id' | 'data' | 'attemptsMade'>,
  error: Error,
  failedAt = new Date(),
): EditorialBriefDeadLetterJobData {
  return { ...job.data, originalJobId: job.id ?? null, failedAt: failedAt.toISOString(), attemptsMade: job.attemptsMade, error: error.message.slice(0, 1_000) };
}

function validDate(value: string, name: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} must be a valid ISO date`);
  return date;
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startEditorialBriefWorker().catch((error) => {
    workerLog.error('Editorial brief worker startup crashed', { error: errorMessage(error) });
    process.exit(1);
  });
}
