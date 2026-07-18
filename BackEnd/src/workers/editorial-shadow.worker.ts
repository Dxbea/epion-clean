import { fileURLToPath } from 'node:url';
import {
  DelayedError,
  UnrecoverableError,
  Worker,
  type ConnectionOptions,
  type Job,
  type Processor,
  type Queue,
} from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/db.js';
import {
  buildEditorialRunIdempotencyKey,
  EditorialRunInProgressError,
  resolveEditorialClusteringConfig,
  runEditorialShadow,
  validateEditorialWindow,
} from '../lib/editorial-shadow/editorial-run-service.js';
import { EditorialShadowMetrics } from '../lib/editorial-shadow/editorial-metrics.js';
import {
  buildEditorialShadowDeadLetterJobId,
  createEditorialShadowQueues,
  createEditorialShadowRedisConnection,
  EDITORIAL_SHADOW_DEAD_LETTER_JOB_NAME,
  EDITORIAL_SHADOW_JOB_ATTEMPTS,
  EDITORIAL_SHADOW_QUEUE_NAME,
  type EditorialShadowDeadLetterJobData,
  type EditorialShadowJobData,
  type EditorialShadowQueues,
} from '../lib/editorial-shadow/editorial-queue.js';
import {
  EDITORIAL_SHADOW_REDIS_KILL_SWITCH_KEY,
  resolveEditorialShadowRuntimeFlags,
  type EditorialShadowRuntimeFlags,
} from '../lib/editorial-shadow/runtime-flags.js';
import {
  acquireRedisLock,
  isRedisKillSwitchActive,
  type DiscoveryRedis,
} from '../lib/discovery/redis-lock.js';
import logger from '../lib/logger.js';

const workerLog = logger.child({ module: 'EditorialShadowWorker' });
const RUN_LOCK_PREFIX = 'epion:editorial-shadow:run-lock:';

export interface EditorialShadowProcessorDependencies {
  client: PrismaClient;
  redis: DiscoveryRedis;
  flags: EditorialShadowRuntimeFlags;
  metrics: EditorialShadowMetrics;
  runShadow?: typeof runEditorialShadow;
}

export function createEditorialShadowJobProcessor(
  dependencies: EditorialShadowProcessorDependencies,
): Processor<EditorialShadowJobData> {
  return async (job) => {
    if (
      dependencies.flags.killSwitch ||
      await isRedisKillSwitchActive(
        dependencies.redis,
        EDITORIAL_SHADOW_REDIS_KILL_SWITCH_KEY,
      )
    ) {
      return delayJob(
        job,
        dependencies.flags.pausedJobDelayMs,
        'Editorial shadow kill switch is active',
      );
    }

    let windowStart: Date;
    let windowEnd: Date;
    let config: ReturnType<typeof resolveEditorialClusteringConfig>;
    try {
      windowStart = validDate(job.data.windowStart, 'windowStart');
      windowEnd = validDate(job.data.windowEnd, 'windowEnd');
      validDate(job.data.requestedAt, 'requestedAt');
      validateEditorialWindow(windowStart, windowEnd);
      config = resolveEditorialClusteringConfig(job.data.config);
    } catch (error) {
      throw new UnrecoverableError(errorMessage(error));
    }
    const expectedKey = buildEditorialRunIdempotencyKey({
      windowStart,
      windowEnd,
      embeddingModel: job.data.embeddingModel,
      config,
    });
    if (expectedKey !== job.data.idempotencyKey) {
      throw new UnrecoverableError(
        'Editorial shadow job idempotency key does not match its payload',
      );
    }

    const lock = await acquireRedisLock(
      dependencies.redis,
      `${RUN_LOCK_PREFIX}${job.data.idempotencyKey}`,
      dependencies.flags.runLockTtlMs,
    );
    if (!lock) {
      dependencies.metrics.increment('runLockMisses');
      return delayJob(job, 30_000, 'Editorial shadow run lock is held');
    }

    dependencies.metrics.increment('jobsStarted');
    const heartbeat = startLockHeartbeat(lock, dependencies.flags.runLockTtlMs);
    try {
      const runShadow = dependencies.runShadow ?? runEditorialShadow;
      const result = await runShadow(dependencies.client, {
        windowStart,
        windowEnd,
        embeddingModel: job.data.embeddingModel,
        config,
      });
      dependencies.metrics.increment('jobsSucceeded');
      dependencies.metrics.recordRun(result);
      return result;
    } catch (error) {
      if (error instanceof EditorialRunInProgressError) {
        return delayJob(job, 30_000, error.message);
      }
      dependencies.metrics.increment('jobsFailed');
      throw error;
    } finally {
      clearInterval(heartbeat);
      await lock.release().catch((error) => {
        workerLog.warn('Failed to release editorial shadow lock', {
          jobId: job.id,
          idempotencyKey: job.data.idempotencyKey,
          error: errorMessage(error),
        });
      });
    }
  };
}

async function delayJob(
  job: Job<EditorialShadowJobData>,
  delayMs: number,
  reason: string,
): Promise<never> {
  await job.moveToDelayed(Date.now() + delayMs, job.token);
  throw new DelayedError(reason);
}

function startLockHeartbeat(
  lock: { extend(ttlMs: number): Promise<boolean> },
  ttlMs: number,
): NodeJS.Timeout {
  const interval = setInterval(() => {
    lock.extend(ttlMs).then((extended) => {
      if (!extended) workerLog.error('Editorial shadow lock ownership was lost');
    }).catch((error) => {
      workerLog.error('Failed to renew editorial shadow lock', {
        error: errorMessage(error),
      });
    });
  }, Math.max(1_000, Math.floor(ttlMs / 3)));
  interval.unref();
  return interval;
}

export interface EditorialShadowWorkerRuntime {
  worker: Worker<EditorialShadowJobData>;
  queues: EditorialShadowQueues;
  metrics: EditorialShadowMetrics;
  close(): Promise<void>;
}

export async function startEditorialShadowWorker(): Promise<EditorialShadowWorkerRuntime | null> {
  const flags = resolveEditorialShadowRuntimeFlags();
  if (!flags.enabled || flags.killSwitch) {
    workerLog.warn('Editorial shadow worker remains disabled', {
      enabled: flags.enabled,
      killSwitch: flags.killSwitch,
    });
    return null;
  }

  const connection = createEditorialShadowRedisConnection();
  const queues = createEditorialShadowQueues(connection as unknown as ConnectionOptions);
  const metrics = new EditorialShadowMetrics();
  const worker = new Worker<EditorialShadowJobData>(
    EDITORIAL_SHADOW_QUEUE_NAME,
    createEditorialShadowJobProcessor({
      client: prisma,
      redis: connection as unknown as DiscoveryRedis,
      flags,
      metrics,
    }),
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency: flags.workerConcurrency,
    },
  );
  attachWorkerEvents(worker, queues.deadLetterQueue, metrics);

  workerLog.info('Editorial shadow worker started', {
    queue: EDITORIAL_SHADOW_QUEUE_NAME,
    concurrency: flags.workerConcurrency,
  });
  return {
    worker,
    queues,
    metrics,
    async close() {
      await worker.close();
      await queues.editorialQueue.close();
      await queues.deadLetterQueue.close();
      await connection.quit();
    },
  };
}

function attachWorkerEvents(
  worker: Worker<EditorialShadowJobData>,
  deadLetterQueue: Queue<EditorialShadowDeadLetterJobData>,
  metrics: EditorialShadowMetrics,
): void {
  worker.on('completed', (job, result) => {
    workerLog.info('Editorial shadow job completed', {
      jobId: job.id,
      idempotencyKey: job.data.idempotencyKey,
      result,
      metrics: metrics.snapshot(),
    });
  });
  worker.on('failed', (job, error) => {
    if (!job || !isTerminalEditorialShadowFailure(job, error)) return;
    const data = buildEditorialShadowDeadLetterData(job, error);
    deadLetterQueue.add(
      EDITORIAL_SHADOW_DEAD_LETTER_JOB_NAME,
      data,
      { jobId: buildEditorialShadowDeadLetterJobId(job.id, job.attemptsMade) },
    ).then(() => {
      metrics.increment('jobsDeadLettered');
      workerLog.error('Editorial shadow job moved to dead-letter queue', {
        jobId: job.id,
        idempotencyKey: job.data.idempotencyKey,
        error: error.message,
        metrics: metrics.snapshot(),
      });
    }).catch((deadLetterError) => {
      workerLog.error('Failed to write editorial shadow dead-letter job', {
        jobId: job.id,
        error: errorMessage(deadLetterError),
      });
    });
  });
  worker.on('error', (error) => {
    workerLog.error('Editorial shadow worker error', { error: error.message });
  });
}

export function isTerminalEditorialShadowFailure(
  job: Pick<Job<EditorialShadowJobData>, 'attemptsMade' | 'opts'>,
  error: Error,
): boolean {
  return error.name === 'UnrecoverableError' ||
    job.attemptsMade >= (job.opts.attempts ?? EDITORIAL_SHADOW_JOB_ATTEMPTS);
}

export function buildEditorialShadowDeadLetterData(
  job: Pick<Job<EditorialShadowJobData>, 'id' | 'data' | 'attemptsMade'>,
  error: Error,
  failedAt = new Date(),
): EditorialShadowDeadLetterJobData {
  return {
    ...job.data,
    originalJobId: job.id ?? null,
    failedAt: failedAt.toISOString(),
    attemptsMade: job.attemptsMade,
    error: error.message.slice(0, 1_000),
  };
}

function validDate(value: string, name: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} must be a valid ISO date`);
  return date;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startEditorialShadowWorker().catch((error) => {
    workerLog.error('Editorial shadow worker startup crashed', {
      error: errorMessage(error),
    });
    process.exit(1);
  });
}
