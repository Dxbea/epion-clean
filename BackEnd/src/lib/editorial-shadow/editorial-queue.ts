import { createHash } from 'node:crypto';
import { Queue, type ConnectionOptions } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import {
  buildEditorialRunIdempotencyKey,
  resolveEditorialClusteringConfig,
  validateEditorialWindow,
} from './editorial-run-service.js';
import type { EditorialClusteringConfig } from './types.js';

export const EDITORIAL_SHADOW_QUEUE_NAME = 'editorial-shadow-queue';
export const EDITORIAL_SHADOW_DEAD_LETTER_QUEUE_NAME = 'editorial-shadow-dead-letter';
export const EDITORIAL_SHADOW_JOB_NAME = 'cluster-editorial-window';
export const EDITORIAL_SHADOW_DEAD_LETTER_JOB_NAME = 'editorial-shadow-failed';
export const EDITORIAL_SHADOW_JOB_ATTEMPTS = 3;

export interface EditorialShadowJobData {
  idempotencyKey: string;
  windowStart: string;
  windowEnd: string;
  embeddingModel: string;
  config: EditorialClusteringConfig;
  documentIds?: string[];
  requestedAt: string;
  trigger: 'MANUAL' | 'SCHEDULED' | 'PROD_SHADOW';
}

export interface EditorialShadowDeadLetterJobData extends EditorialShadowJobData {
  originalJobId: string | null;
  failedAt: string;
  attemptsMade: number;
  error: string;
}

export interface EditorialShadowQueues {
  editorialQueue: Queue<EditorialShadowJobData>;
  deadLetterQueue: Queue<EditorialShadowDeadLetterJobData>;
}

export interface PrepareEditorialShadowJobOptions {
  windowStart: Date;
  windowEnd: Date;
  embeddingModel: string;
  config?: Partial<EditorialClusteringConfig>;
  documentIds?: string[];
  requestedAt?: Date;
  trigger: EditorialShadowJobData['trigger'];
}

export function prepareEditorialShadowJob(
  options: PrepareEditorialShadowJobOptions,
): EditorialShadowJobData {
  validateEditorialWindow(options.windowStart, options.windowEnd);
  if (!options.embeddingModel.trim()) throw new Error('embeddingModel is required');
  const config = resolveEditorialClusteringConfig(options.config);
  const documentIds = options.documentIds?.map((id) => id.trim()).filter(Boolean).sort();
  return {
    idempotencyKey: buildEditorialRunIdempotencyKey({
      windowStart: options.windowStart,
      windowEnd: options.windowEnd,
      embeddingModel: options.embeddingModel,
      config,
      documentIds,
    }),
    windowStart: options.windowStart.toISOString(),
    windowEnd: options.windowEnd.toISOString(),
    embeddingModel: options.embeddingModel,
    config,
    documentIds,
    requestedAt: (options.requestedAt ?? new Date()).toISOString(),
    trigger: options.trigger,
  };
}

export function createEditorialShadowRedisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export function createEditorialShadowQueues(
  connection: ConnectionOptions,
): EditorialShadowQueues {
  return {
    editorialQueue: new Queue<EditorialShadowJobData>(EDITORIAL_SHADOW_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: EDITORIAL_SHADOW_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 250,
        removeOnFail: 250,
      },
    }),
    deadLetterQueue: new Queue<EditorialShadowDeadLetterJobData>(
      EDITORIAL_SHADOW_DEAD_LETTER_QUEUE_NAME,
      {
        connection,
        defaultJobOptions: {
          attempts: 1,
          removeOnComplete: false,
          removeOnFail: false,
        },
      },
    ),
  };
}

export function buildEditorialShadowJobId(idempotencyKey: string): string {
  if (!idempotencyKey.trim()) throw new Error('idempotencyKey is required');
  return `editorial-shadow-${createHash('sha256')
    .update(idempotencyKey)
    .digest('hex')
    .slice(0, 32)}`;
}

export async function enqueueEditorialShadowJob(
  queue: Pick<Queue<EditorialShadowJobData>, 'add'>,
  data: EditorialShadowJobData,
): Promise<void> {
  await queue.add(EDITORIAL_SHADOW_JOB_NAME, data, {
    jobId: buildEditorialShadowJobId(data.idempotencyKey),
  });
}

export function buildEditorialShadowDeadLetterJobId(
  originalJobId: string | undefined,
  attemptsMade: number,
): string {
  return `editorial-shadow-dlq-${createHash('sha256')
    .update(`${originalJobId ?? 'unknown'}:${attemptsMade}`)
    .digest('hex')
    .slice(0, 32)}`;
}
