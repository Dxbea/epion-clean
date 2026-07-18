import { createHash } from 'node:crypto';
import { Queue, type ConnectionOptions } from 'bullmq';
import { Redis as IORedis } from 'ioredis';

export const DOCUMENT_QUEUE_NAME = 'document-corpus-queue';
export const DOCUMENT_DEAD_LETTER_QUEUE_NAME = 'document-corpus-dead-letter';
export const DOCUMENT_JOB_NAME = 'fetch-extract-index-document';
export const DOCUMENT_DEAD_LETTER_JOB_NAME = 'document-processing-failed';
export const DOCUMENT_JOB_ATTEMPTS = 3;

export interface DocumentJobData {
  documentId: string;
  revision: string;
  requestedAt: string;
  trigger: 'DISCOVERY' | 'MANUAL' | 'RETRY';
}

export interface DocumentDeadLetterJobData extends DocumentJobData {
  originalJobId: string | null;
  failedAt: string;
  attemptsMade: number;
  error: string;
}

export interface DocumentQueues {
  documentQueue: Queue<DocumentJobData>;
  deadLetterQueue: Queue<DocumentDeadLetterJobData>;
}

export function createDocumentRedisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export function createDocumentQueues(connection: ConnectionOptions): DocumentQueues {
  return {
    documentQueue: new Queue<DocumentJobData>(DOCUMENT_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: DOCUMENT_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    }),
    deadLetterQueue: new Queue<DocumentDeadLetterJobData>(DOCUMENT_DEAD_LETTER_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      },
    }),
  };
}

export function buildDocumentJobId(documentId: string, revision: string): string {
  if (!documentId.trim()) throw new Error('documentId is required');
  if (!revision.trim()) throw new Error('revision is required');
  const identity = createHash('sha256')
    .update(`${documentId}:${revision}`)
    .digest('hex')
    .slice(0, 32);
  return `document-${identity}`;
}

export async function enqueueDocumentJob(
  queue: Pick<Queue<DocumentJobData>, 'add'>,
  data: DocumentJobData,
): Promise<void> {
  await queue.add(DOCUMENT_JOB_NAME, data, {
    jobId: buildDocumentJobId(data.documentId, data.revision),
  });
}

export function buildDocumentDeadLetterJobId(
  originalJobId: string | undefined,
  attemptsMade: number,
): string {
  const identity = `${originalJobId ?? 'unknown'}:${attemptsMade}`;
  return `document-dlq-${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
}
