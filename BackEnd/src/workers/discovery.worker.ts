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
import { prisma } from '../lib/db.js';
import logger from '../lib/logger.js';
import { DiscoveryConnectorConfigError } from '../lib/discovery/connectors/config.js';
import { DiscoveryMetrics } from '../lib/discovery/discovery-metrics.js';
import {
  DiscoverySourceUnavailableError,
  recordDiscoveryFailure,
  runDiscoverySource,
  type DiscoveryOrchestratorClient,
} from '../lib/discovery/discovery-orchestrator.js';
import {
  buildDiscoveryDeadLetterJobId,
  createDiscoveryQueues,
  createDiscoveryRedisConnection,
  DISCOVERY_DEAD_LETTER_JOB_NAME,
  DISCOVERY_JOB_ATTEMPTS,
  DISCOVERY_QUEUE_NAME,
  type DiscoveryDeadLetterJobData,
  type DiscoveryJobData,
  type DiscoveryQueues,
} from '../lib/discovery/discovery-queue.js';
import {
  DISCOVERY_REDIS_KILL_SWITCH_KEY,
  resolveDiscoveryRuntimeFlags,
  type DiscoveryRuntimeFlags,
} from '../lib/discovery/runtime-flags.js';
import {
  acquireRedisLock,
  isRedisKillSwitchActive,
  type DiscoveryRedis,
} from '../lib/discovery/redis-lock.js';
import {
  startDiscoveryScheduler,
  type DiscoverySchedulerClient,
} from '../lib/discovery/discovery-scheduler.js';
import { createWorkerDiscoveryConnectorRegistry } from './discovery-bootstrap.js';

const workerLog = logger.child({ module: 'DiscoveryWorker' });
const SOURCE_LOCK_PREFIX = 'epion:discovery:source-lock:';

export interface DiscoveryProcessorDependencies {
  client: DiscoveryOrchestratorClient;
  registry: ReturnType<typeof createWorkerDiscoveryConnectorRegistry>;
  redis: DiscoveryRedis;
  flags: DiscoveryRuntimeFlags;
  metrics: DiscoveryMetrics;
  runSource?: typeof runDiscoverySource;
  recordFailure?: typeof recordDiscoveryFailure;
}

export function createDiscoveryJobProcessor(
  dependencies: DiscoveryProcessorDependencies,
): Processor<DiscoveryJobData> {
  return async (job) => {
    if (dependencies.flags.killSwitch || await isRedisKillSwitchActive(
      dependencies.redis,
      DISCOVERY_REDIS_KILL_SWITCH_KEY,
    )) {
      workerLog.warn('Discovery job skipped because kill switch is active', {
        jobId: job.id,
        sourceId: job.data.discoverySourceId,
      });
      return delayDiscoveryJob(
        job,
        dependencies.flags.schedulerPollMs,
        'Discovery kill switch is active',
      );
    }

    const sourceLock = await acquireRedisLock(
      dependencies.redis,
      `${SOURCE_LOCK_PREFIX}${job.data.discoverySourceId}`,
      dependencies.flags.sourceLockTtlMs,
    );
    if (!sourceLock) {
      dependencies.metrics.increment('sourceLockMisses');
      workerLog.warn('Discovery job skipped because source lock is held', {
        jobId: job.id,
        sourceId: job.data.discoverySourceId,
      });
      return delayDiscoveryJob(job, 30_000, 'Discovery source lock is held');
    }

    const abortController = new AbortController();
    const lockHeartbeat = startSourceLockHeartbeat(
      sourceLock,
      dependencies.flags.sourceLockTtlMs,
      job,
      (error) => abortController.abort(error),
    );

    try {
      const runSource = dependencies.runSource ?? runDiscoverySource;
      return await runSource(
        {
          client: dependencies.client,
          registry: dependencies.registry,
          metrics: dependencies.metrics,
        },
        job.data.discoverySourceId,
        { signal: abortController.signal },
      );
    } catch (error) {
      const unrecoverable = isUnrecoverableDiscoveryError(error);
      const finalAttempt = unrecoverable ||
        job.attemptsMade + 1 >= (job.opts.attempts ?? DISCOVERY_JOB_ATTEMPTS);

      if (finalAttempt && !(error instanceof DiscoverySourceUnavailableError)) {
        try {
          const recordFailure = dependencies.recordFailure ?? recordDiscoveryFailure;
          await recordFailure(
            dependencies.client,
            job.data.discoverySourceId,
            error,
          );
        } catch (stateError) {
          workerLog.error('Failed to persist terminal discovery failure state', {
            jobId: job.id,
            sourceId: job.data.discoverySourceId,
            error: errorMessage(stateError),
          });
        }
      }

      if (unrecoverable) throw new UnrecoverableError(errorMessage(error));
      throw error;
    } finally {
      clearInterval(lockHeartbeat);
      await sourceLock.release().catch((error) => {
        workerLog.warn('Failed to release discovery source lock', {
          jobId: job.id,
          sourceId: job.data.discoverySourceId,
          error: errorMessage(error),
        });
      });
    }
  };
}

async function delayDiscoveryJob(
  job: Job<DiscoveryJobData>,
  delayMs: number,
  reason: string,
): Promise<never> {
  await job.moveToDelayed(Date.now() + delayMs, job.token);
  throw new DelayedError(reason);
}

function startSourceLockHeartbeat(
  lock: { extend(ttlMs: number): Promise<boolean> },
  ttlMs: number,
  job: Job<DiscoveryJobData>,
  onLockLost: (error: Error) => void,
): NodeJS.Timeout {
  const interval = setInterval(() => {
    lock.extend(ttlMs).then((extended) => {
      if (!extended) {
        const error = new Error('Discovery source lock ownership was lost');
        workerLog.error(error.message, {
          jobId: job.id,
          sourceId: job.data.discoverySourceId,
        });
        onLockLost(error);
      }
    }).catch((error) => {
      workerLog.error('Failed to renew discovery source lock', {
        jobId: job.id,
        sourceId: job.data.discoverySourceId,
        error: errorMessage(error),
      });
      onLockLost(error instanceof Error ? error : new Error(String(error)));
    });
  }, Math.max(1_000, Math.floor(ttlMs / 3)));
  interval.unref();
  return interval;
}

export interface DiscoveryWorkerRuntime {
  worker: Worker<DiscoveryJobData>;
  queues: DiscoveryQueues;
  schedulerInterval: NodeJS.Timeout | null;
  metrics: DiscoveryMetrics;
  close(): Promise<void>;
}

export async function startDiscoveryWorker(): Promise<DiscoveryWorkerRuntime | null> {
  const flags = resolveDiscoveryRuntimeFlags();
  if (!flags.enabled || flags.killSwitch) {
    workerLog.warn('Discovery worker remains disabled', {
      enabled: flags.enabled,
      killSwitch: flags.killSwitch,
      schedulerEnabled: flags.schedulerEnabled,
    });
    return null;
  }

  const connection = createDiscoveryRedisConnection();
  const queues = createDiscoveryQueues(connection as unknown as ConnectionOptions);
  const registry = createWorkerDiscoveryConnectorRegistry();
  const metrics = new DiscoveryMetrics();
  const processor = createDiscoveryJobProcessor({
    client: prisma as unknown as DiscoveryOrchestratorClient,
    registry,
    redis: connection as unknown as DiscoveryRedis,
    flags,
    metrics,
  });
  const worker = new Worker<DiscoveryJobData>(DISCOVERY_QUEUE_NAME, processor, {
    connection: connection as unknown as ConnectionOptions,
    concurrency: flags.workerConcurrency,
  });

  attachWorkerEvents(worker, queues.deadLetterQueue, metrics);

  const schedulerInterval = flags.schedulerEnabled
    ? startDiscoveryScheduler({
        client: prisma as unknown as DiscoverySchedulerClient,
        queue: queues.discoveryQueue,
        redis: connection as unknown as DiscoveryRedis,
        flags,
        metrics,
      })
    : null;

  workerLog.info('Discovery worker started', {
    queue: DISCOVERY_QUEUE_NAME,
    concurrency: flags.workerConcurrency,
    schedulerEnabled: flags.schedulerEnabled,
    registeredConnectors: registry.registeredTypes(),
  });

  return {
    worker,
    queues,
    schedulerInterval,
    metrics,
    async close() {
      if (schedulerInterval) clearInterval(schedulerInterval);
      await worker.close();
      await queues.discoveryQueue.close();
      await queues.deadLetterQueue.close();
      await connection.quit();
    },
  };
}

function attachWorkerEvents(
  worker: Worker<DiscoveryJobData>,
  deadLetterQueue: Queue<DiscoveryDeadLetterJobData>,
  metrics: DiscoveryMetrics,
): void {
  worker.on('completed', (job, result) => {
    workerLog.info('Discovery job completed', {
      jobId: job.id,
      sourceId: job.data.discoverySourceId,
      result,
      metrics: metrics.snapshot(),
    });
  });

  worker.on('failed', (job, error) => {
    if (!job || !isTerminalDiscoveryJobFailure(job, error)) return;

    const deadLetterData = buildDiscoveryDeadLetterData(job, error);
    deadLetterQueue.add(
      DISCOVERY_DEAD_LETTER_JOB_NAME,
      deadLetterData,
      { jobId: buildDiscoveryDeadLetterJobId(job.id, job.attemptsMade) },
    ).then(() => {
      metrics.increment('jobsDeadLettered');
      workerLog.error('Discovery job moved to dead-letter queue', {
        jobId: job.id,
        sourceId: job.data.discoverySourceId,
        attemptsMade: job.attemptsMade,
        error: error.message,
        metrics: metrics.snapshot(),
      });
    }).catch((deadLetterError) => {
      workerLog.error('Failed to write discovery dead-letter job', {
        jobId: job.id,
        sourceId: job.data.discoverySourceId,
        error: errorMessage(deadLetterError),
      });
    });
  });

  worker.on('error', (error) => {
    workerLog.error('Discovery worker error', { error: error.message });
  });
}

export function isTerminalDiscoveryJobFailure(
  job: Pick<Job<DiscoveryJobData>, 'attemptsMade' | 'opts'>,
  error: Error,
): boolean {
  return error.name === 'UnrecoverableError' ||
    job.attemptsMade >= (job.opts.attempts ?? DISCOVERY_JOB_ATTEMPTS);
}

export function buildDiscoveryDeadLetterData(
  job: Pick<Job<DiscoveryJobData>, 'id' | 'data' | 'attemptsMade'>,
  error: Error,
  failedAt = new Date(),
): DiscoveryDeadLetterJobData {
  return {
    ...job.data,
    originalJobId: job.id ?? null,
    failedAt: failedAt.toISOString(),
    attemptsMade: job.attemptsMade,
    error: error.message.slice(0, 1_000),
  };
}

function isUnrecoverableDiscoveryError(error: unknown): boolean {
  return error instanceof DiscoverySourceUnavailableError ||
    error instanceof DiscoveryConnectorConfigError ||
    (error instanceof Error && error.message.startsWith('Discovery connector is not registered'));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startDiscoveryWorker().catch((error) => {
    workerLog.error('Discovery worker startup crashed', {
      error: errorMessage(error),
    });
    process.exit(1);
  });
}
