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
  processIngestedDocument,
  type DocumentCorpusDependencies,
  type DocumentCorpusResult,
} from '../lib/document-corpus/document-corpus-service.js';
import { DocumentPipelineMetrics } from '../lib/document-corpus/document-metrics.js';
import {
  buildDocumentDeadLetterJobId,
  createDocumentQueues,
  createDocumentRedisConnection,
  DOCUMENT_DEAD_LETTER_JOB_NAME,
  DOCUMENT_JOB_ATTEMPTS,
  DOCUMENT_QUEUE_NAME,
  type DocumentDeadLetterJobData,
  type DocumentJobData,
  type DocumentQueues,
} from '../lib/document-corpus/document-queue.js';
import {
  DOCUMENT_PIPELINE_REDIS_KILL_SWITCH_KEY,
  resolveDocumentPipelineRuntimeFlags,
  type DocumentPipelineRuntimeFlags,
} from '../lib/document-corpus/runtime-flags.js';
import {
  acquireRedisLock,
  isRedisKillSwitchActive,
  type DiscoveryRedis,
} from '../lib/discovery/redis-lock.js';
import logger from '../lib/logger.js';

const workerLog = logger.child({ module: 'DocumentCorpusWorker' });
const DOCUMENT_LOCK_PREFIX = 'epion:document-corpus:document-lock:';

export interface DocumentProcessorDependencies {
  client: PrismaClient;
  redis: DiscoveryRedis;
  flags: DocumentPipelineRuntimeFlags;
  metrics: DocumentPipelineMetrics;
  processDocument?: typeof processIngestedDocument;
  corpusDependencies?: Partial<Omit<DocumentCorpusDependencies, 'client'>>;
}

export function createDocumentJobProcessor(
  dependencies: DocumentProcessorDependencies,
): Processor<DocumentJobData> {
  return async (job) => {
    if (
      dependencies.flags.killSwitch ||
      await isRedisKillSwitchActive(
        dependencies.redis,
        DOCUMENT_PIPELINE_REDIS_KILL_SWITCH_KEY,
      )
    ) {
      workerLog.warn('Document corpus job paused because kill switch is active', {
        jobId: job.id,
        documentId: job.data.documentId,
      });
      return delayDocumentJob(
        job,
        dependencies.flags.pausedJobDelayMs,
        'Document corpus kill switch is active',
      );
    }

    const documentLock = await acquireRedisLock(
      dependencies.redis,
      `${DOCUMENT_LOCK_PREFIX}${job.data.documentId}`,
      dependencies.flags.documentLockTtlMs,
    );
    if (!documentLock) {
      dependencies.metrics.increment('documentLockMisses');
      return delayDocumentJob(job, 30_000, 'Document corpus lock is held');
    }

    const startedAt = Date.now();
    dependencies.metrics.increment('jobsStarted');
    const abortController = new AbortController();
    const heartbeat = startDocumentLockHeartbeat(
      documentLock,
      dependencies.flags.documentLockTtlMs,
      job,
      (error) => abortController.abort(error),
    );

    try {
      const processDocument = dependencies.processDocument ?? processIngestedDocument;
      const processing = processDocument(
        {
          client: dependencies.client,
          ...dependencies.corpusDependencies,
        },
        job.data.documentId,
        { jobId: job.id },
      );
      const lockLoss = new Promise<never>((_, reject) => {
        abortController.signal.addEventListener('abort', () => {
          reject(abortController.signal.reason ?? new Error('Document lock was lost'));
        }, { once: true });
      });
      const result = await Promise.race([processing, lockLoss]);
      recordResultMetrics(dependencies.metrics, result);
      dependencies.metrics.increment('jobsSucceeded');
      return result;
    } catch (error) {
      dependencies.metrics.increment('jobsFailed');
      if (errorMessage(error).startsWith('IngestedDocument not found:')) {
        throw new UnrecoverableError(errorMessage(error));
      }
      throw error;
    } finally {
      clearInterval(heartbeat);
      dependencies.metrics.recordDuration(Date.now() - startedAt);
      await documentLock.release().catch((error) => {
        workerLog.warn('Failed to release document corpus lock', {
          jobId: job.id,
          documentId: job.data.documentId,
          error: errorMessage(error),
        });
      });
    }
  };
}

async function delayDocumentJob(
  job: Job<DocumentJobData>,
  delayMs: number,
  reason: string,
): Promise<never> {
  await job.moveToDelayed(Date.now() + delayMs, job.token);
  throw new DelayedError(reason);
}

function startDocumentLockHeartbeat(
  lock: { extend(ttlMs: number): Promise<boolean> },
  ttlMs: number,
  job: Job<DocumentJobData>,
  onLockLost: (error: Error) => void,
): NodeJS.Timeout {
  const interval = setInterval(() => {
    lock.extend(ttlMs).then((extended) => {
      if (!extended) onLockLost(new Error('Document corpus lock ownership was lost'));
    }).catch((error) => onLockLost(
      error instanceof Error ? error : new Error(String(error)),
    ));
  }, Math.max(1_000, Math.floor(ttlMs / 3)));
  interval.unref();
  return interval;
}

function recordResultMetrics(
  metrics: DocumentPipelineMetrics,
  result: DocumentCorpusResult,
): void {
  if (result.outcome === 'BLOCKED') metrics.increment('jobsBlocked');
  if (result.outcome === 'DUPLICATE') metrics.increment('exactDuplicates');
  metrics.increment('chunksIndexed', result.chunks);
  metrics.increment('embeddingInputTokens', result.inputTokens ?? 0);
  metrics.increment('estimatedCostMicros', result.estimatedCostMicros ?? 0);
}

export interface DocumentWorkerRuntime {
  worker: Worker<DocumentJobData>;
  queues: DocumentQueues;
  metrics: DocumentPipelineMetrics;
  close(): Promise<void>;
}

export async function startDocumentCorpusWorker(): Promise<DocumentWorkerRuntime | null> {
  const flags = resolveDocumentPipelineRuntimeFlags();
  if (!flags.enabled || flags.killSwitch) {
    workerLog.warn('Document corpus worker remains disabled', {
      enabled: flags.enabled,
      killSwitch: flags.killSwitch,
    });
    return null;
  }

  const connection = createDocumentRedisConnection();
  const queues = createDocumentQueues(connection as unknown as ConnectionOptions);
  const metrics = new DocumentPipelineMetrics();
  const processor = createDocumentJobProcessor({
    client: prisma,
    redis: connection as unknown as DiscoveryRedis,
    flags,
    metrics,
  });
  const worker = new Worker<DocumentJobData>(DOCUMENT_QUEUE_NAME, processor, {
    connection: connection as unknown as ConnectionOptions,
    concurrency: flags.workerConcurrency,
  });
  attachWorkerEvents(worker, queues.deadLetterQueue, metrics);

  workerLog.info('Document corpus worker started', {
    queue: DOCUMENT_QUEUE_NAME,
    concurrency: flags.workerConcurrency,
  });
  return {
    worker,
    queues,
    metrics,
    async close() {
      await worker.close();
      await queues.documentQueue.close();
      await queues.deadLetterQueue.close();
      await connection.quit();
    },
  };
}

function attachWorkerEvents(
  worker: Worker<DocumentJobData>,
  deadLetterQueue: Queue<DocumentDeadLetterJobData>,
  metrics: DocumentPipelineMetrics,
): void {
  worker.on('completed', (job, result) => {
    workerLog.info('Document corpus job completed', {
      jobId: job.id,
      documentId: job.data.documentId,
      result,
      metrics: metrics.snapshot(),
    });
  });
  worker.on('failed', (job, error) => {
    if (!job || !isTerminalDocumentJobFailure(job, error)) return;
    const deadLetterData = buildDocumentDeadLetterData(job, error);
    deadLetterQueue.add(
      DOCUMENT_DEAD_LETTER_JOB_NAME,
      deadLetterData,
      { jobId: buildDocumentDeadLetterJobId(job.id, job.attemptsMade) },
    ).then(() => {
      metrics.increment('jobsDeadLettered');
      workerLog.error('Document corpus job moved to dead-letter queue', {
        jobId: job.id,
        documentId: job.data.documentId,
        attemptsMade: job.attemptsMade,
        error: error.message,
        metrics: metrics.snapshot(),
      });
    }).catch((deadLetterError) => {
      workerLog.error('Failed to write document corpus dead-letter job', {
        jobId: job.id,
        documentId: job.data.documentId,
        error: errorMessage(deadLetterError),
      });
    });
  });
  worker.on('error', (error) => {
    workerLog.error('Document corpus worker error', { error: error.message });
  });
}

export function isTerminalDocumentJobFailure(
  job: Pick<Job<DocumentJobData>, 'attemptsMade' | 'opts'>,
  error: Error,
): boolean {
  return error.name === 'UnrecoverableError' ||
    job.attemptsMade >= (job.opts.attempts ?? DOCUMENT_JOB_ATTEMPTS);
}

export function buildDocumentDeadLetterData(
  job: Pick<Job<DocumentJobData>, 'id' | 'data' | 'attemptsMade'>,
  error: Error,
  failedAt = new Date(),
): DocumentDeadLetterJobData {
  return {
    ...job.data,
    originalJobId: job.id ?? null,
    failedAt: failedAt.toISOString(),
    attemptsMade: job.attemptsMade,
    error: error.message.slice(0, 1_000),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startDocumentCorpusWorker().catch((error) => {
    workerLog.error('Document corpus worker startup crashed', {
      error: errorMessage(error),
    });
    process.exit(1);
  });
}
