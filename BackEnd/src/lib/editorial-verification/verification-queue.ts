import { createHash } from 'node:crypto';
import { Queue, type ConnectionOptions } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { EDITORIAL_VERIFICATION_VERSION } from './types.js';

export const EDITORIAL_VERIFICATION_QUEUE_NAME = 'editorial-verification-queue';
export const EDITORIAL_VERIFICATION_DLQ_NAME = 'editorial-verification-dead-letter';
export const EDITORIAL_VERIFICATION_JOB_NAME = 'verify-editorial-draft';
export const EDITORIAL_VERIFICATION_DLQ_JOB_NAME = 'editorial-verification-failed';
export const EDITORIAL_VERIFICATION_JOB_ATTEMPTS = 4;

export interface EditorialVerificationJobData {
  draftId: string;
  revisionId: string;
  expectedContentHash: string;
  verificationVersion: string;
  requestedAt: string;
  trigger: 'ADMIN' | 'RECONCILIATION';
}

export interface EditorialVerificationDeadLetterData extends EditorialVerificationJobData {
  originalJobId: string | null;
  failedAt: string;
  attemptsMade: number;
  error: string;
}

export function prepareEditorialVerificationJob(input: {
  draftId: string;
  revisionId: string;
  expectedContentHash: string;
  trigger: EditorialVerificationJobData['trigger'];
  requestedAt?: Date;
}): EditorialVerificationJobData {
  if (!input.draftId.trim() || !input.revisionId.trim() || !input.expectedContentHash.trim()) {
    throw new Error('draftId, revisionId and expectedContentHash are required');
  }
  return {
    draftId: input.draftId,
    revisionId: input.revisionId,
    expectedContentHash: input.expectedContentHash,
    verificationVersion: EDITORIAL_VERIFICATION_VERSION,
    requestedAt: (input.requestedAt ?? new Date()).toISOString(),
    trigger: input.trigger,
  };
}

export function buildEditorialVerificationJobId(data: EditorialVerificationJobData): string {
  return `editorial-verification-${createHash('sha256').update(JSON.stringify({
    draftId: data.draftId,
    revisionId: data.revisionId,
    expectedContentHash: data.expectedContentHash,
    verificationVersion: data.verificationVersion,
  })).digest('hex').slice(0, 32)}`;
}

export async function enqueueEditorialVerificationJob(
  queue: Pick<Queue<EditorialVerificationJobData>, 'add'>,
  data: EditorialVerificationJobData,
): Promise<string> {
  const jobId = buildEditorialVerificationJobId(data);
  await queue.add(EDITORIAL_VERIFICATION_JOB_NAME, data, { jobId });
  return jobId;
}

export function createEditorialVerificationRedisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export function createEditorialVerificationQueues(connection: ConnectionOptions) {
  return {
    verificationQueue: new Queue<EditorialVerificationJobData>(EDITORIAL_VERIFICATION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: EDITORIAL_VERIFICATION_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    }),
    deadLetterQueue: new Queue<EditorialVerificationDeadLetterData>(EDITORIAL_VERIFICATION_DLQ_NAME, {
      connection,
      defaultJobOptions: { attempts: 1, removeOnComplete: false, removeOnFail: false },
    }),
  };
}

export function buildEditorialVerificationDeadLetterJobId(jobId: string | undefined, attempts: number): string {
  return `editorial-verification-dlq-${createHash('sha256').update(`${jobId ?? 'unknown'}:${attempts}`).digest('hex').slice(0, 32)}`;
}
