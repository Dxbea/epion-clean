import { createHash } from 'node:crypto';
import { Queue, type ConnectionOptions } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { resolveEditorialBriefConfig } from './dossier-service.js';
import { EDITORIAL_BRIEF_PROMPT_VERSION, EDITORIAL_DOSSIER_VERSION, type EditorialBriefConfig } from './types.js';

export const EDITORIAL_BRIEF_QUEUE_NAME = 'editorial-brief-queue';
export const EDITORIAL_BRIEF_DEAD_LETTER_QUEUE_NAME = 'editorial-brief-dead-letter';
export const EDITORIAL_BRIEF_JOB_NAME = 'build-editorial-briefs';
export const EDITORIAL_BRIEF_DEAD_LETTER_JOB_NAME = 'editorial-brief-failed';
export const EDITORIAL_BRIEF_JOB_ATTEMPTS = 3;

export interface EditorialBriefJobData {
  editorialRunId: string;
  dossierVersion: string;
  promptVersion: string;
  generatorModel: string;
  config: EditorialBriefConfig;
  requestedAt: string;
  trigger: 'MANUAL';
}

export interface EditorialBriefDeadLetterJobData extends EditorialBriefJobData {
  originalJobId: string | null;
  failedAt: string;
  attemptsMade: number;
  error: string;
}

export function prepareEditorialBriefJob(options: {
  editorialRunId: string;
  generatorModel?: string;
  config?: Partial<EditorialBriefConfig>;
  requestedAt?: Date;
}): EditorialBriefJobData {
  if (!options.editorialRunId.trim()) throw new Error('editorialRunId is required');
  const generatorModel = options.generatorModel?.trim() || process.env.EDITORIAL_BRIEF_MODEL || 'gpt-4o-mini';
  return {
    editorialRunId: options.editorialRunId,
    dossierVersion: EDITORIAL_DOSSIER_VERSION,
    promptVersion: EDITORIAL_BRIEF_PROMPT_VERSION,
    generatorModel,
    config: resolveEditorialBriefConfig(options.config),
    requestedAt: (options.requestedAt ?? new Date()).toISOString(),
    trigger: 'MANUAL',
  };
}

export function buildEditorialBriefJobId(data: EditorialBriefJobData): string {
  return `editorial-brief-${createHash('sha256').update(JSON.stringify({
    editorialRunId: data.editorialRunId,
    dossierVersion: data.dossierVersion,
    promptVersion: data.promptVersion,
    generatorModel: data.generatorModel,
    config: data.config,
  })).digest('hex').slice(0, 32)}`;
}

export async function enqueueEditorialBriefJob(
  queue: Pick<Queue<EditorialBriefJobData>, 'add'>,
  data: EditorialBriefJobData,
): Promise<void> {
  await queue.add(EDITORIAL_BRIEF_JOB_NAME, data, { jobId: buildEditorialBriefJobId(data) });
}

export function createEditorialBriefRedisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export function createEditorialBriefQueues(connection: ConnectionOptions) {
  return {
    briefQueue: new Queue<EditorialBriefJobData>(EDITORIAL_BRIEF_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: EDITORIAL_BRIEF_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 250,
        removeOnFail: 250,
      },
    }),
    deadLetterQueue: new Queue<EditorialBriefDeadLetterJobData>(EDITORIAL_BRIEF_DEAD_LETTER_QUEUE_NAME, {
      connection,
      defaultJobOptions: { attempts: 1, removeOnComplete: false, removeOnFail: false },
    }),
  };
}

export function buildEditorialBriefDeadLetterJobId(originalJobId: string | undefined, attemptsMade: number): string {
  return `editorial-brief-dlq-${createHash('sha256').update(`${originalJobId ?? 'unknown'}:${attemptsMade}`).digest('hex').slice(0, 32)}`;
}
