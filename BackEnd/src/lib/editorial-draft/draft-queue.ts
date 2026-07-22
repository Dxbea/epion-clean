import { createHash } from 'node:crypto';
import { Queue, type ConnectionOptions } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { resolveEditorialDraftConfig } from './draft-service.js';
import { EDITORIAL_CRITIC_PROMPT_VERSION, EDITORIAL_DRAFT_PROMPT_VERSION, EDITORIAL_DRAFT_VERSION, type EditorialDraftConfig } from './types.js';

export const EDITORIAL_DRAFT_QUEUE_NAME = 'editorial-draft-queue';
export const EDITORIAL_DRAFT_DLQ_NAME = 'editorial-draft-dead-letter';
export const EDITORIAL_DRAFT_JOB_NAME = 'generate-controlled-editorial-draft';
export const EDITORIAL_DRAFT_DLQ_JOB_NAME = 'editorial-draft-failed';
export const EDITORIAL_DRAFT_JOB_ATTEMPTS = 3;

export type EditorialDraftJobTrigger = 'MANUAL' | 'PROD_SHADOW_RETRY';

export interface EditorialDraftJobData {
  briefId: string;
  draftVersion: string;
  promptVersion: string;
  criticPromptVersion: string;
  generatorModel: string;
  criticModel: string;
  config: EditorialDraftConfig;
  retryKey: string | null;
  requestedAt: string;
  trigger: EditorialDraftJobTrigger;
}

export interface EditorialDraftDeadLetterData extends EditorialDraftJobData {
  originalJobId: string | null;
  failedAt: string;
  attemptsMade: number;
  error: string;
}

export function prepareEditorialDraftJob(options: {
  briefId: string;
  generatorModel?: string;
  criticModel?: string;
  config?: Partial<EditorialDraftConfig>;
  retryKey?: string | null;
  trigger?: EditorialDraftJobTrigger;
  requestedAt?: Date;
}): EditorialDraftJobData {
  if (!options.briefId.trim()) throw new Error('briefId is required');
  const trigger = options.trigger ?? 'MANUAL';
  if (trigger === 'PROD_SHADOW_RETRY' && !options.retryKey?.trim()) throw new Error('retryKey is required for a production-shadow draft retry');
  return {
    briefId: options.briefId,
    draftVersion: EDITORIAL_DRAFT_VERSION,
    promptVersion: EDITORIAL_DRAFT_PROMPT_VERSION,
    criticPromptVersion: EDITORIAL_CRITIC_PROMPT_VERSION,
    generatorModel: options.generatorModel?.trim() || process.env.EDITORIAL_DRAFT_MODEL || 'gpt-4o-mini',
    criticModel: options.criticModel?.trim() || process.env.EDITORIAL_CRITIC_MODEL || 'gpt-4o-mini',
    config: resolveEditorialDraftConfig(options.config),
    retryKey: options.retryKey?.trim() || null,
    requestedAt: (options.requestedAt ?? new Date()).toISOString(),
    trigger,
  };
}

export function buildEditorialDraftJobId(data: EditorialDraftJobData): string {
  return `editorial-draft-${createHash('sha256').update(JSON.stringify({
    briefId: data.briefId, draftVersion: data.draftVersion, promptVersion: data.promptVersion,
    criticPromptVersion: data.criticPromptVersion, generatorModel: data.generatorModel,
    criticModel: data.criticModel, config: data.config, retryKey: data.retryKey, trigger: data.trigger,
  })).digest('hex').slice(0, 32)}`;
}

export async function enqueueEditorialDraftJob(queue: Pick<Queue<EditorialDraftJobData>, 'add'>, data: EditorialDraftJobData): Promise<void> {
  await queue.add(EDITORIAL_DRAFT_JOB_NAME, data, { jobId: buildEditorialDraftJobId(data) });
}

export function createEditorialDraftRedisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null, enableReadyCheck: false });
}

export function createEditorialDraftQueues(connection: ConnectionOptions) {
  return {
    draftQueue: new Queue<EditorialDraftJobData>(EDITORIAL_DRAFT_QUEUE_NAME, { connection, defaultJobOptions: { attempts: EDITORIAL_DRAFT_JOB_ATTEMPTS, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 250, removeOnFail: 250 } }),
    deadLetterQueue: new Queue<EditorialDraftDeadLetterData>(EDITORIAL_DRAFT_DLQ_NAME, { connection, defaultJobOptions: { attempts: 1, removeOnComplete: false, removeOnFail: false } }),
  };
}

export function buildEditorialDraftDeadLetterJobId(jobId: string | undefined, attempts: number): string {
  return `editorial-draft-dlq-${createHash('sha256').update(`${jobId ?? 'unknown'}:${attempts}`).digest('hex').slice(0, 32)}`;
}
