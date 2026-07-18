import { createHash } from 'node:crypto';
import { Queue, type ConnectionOptions } from 'bullmq';
import { Redis as IORedis } from 'ioredis';

export const DISCOVERY_QUEUE_NAME = 'editorial-discovery-queue';
export const DISCOVERY_DEAD_LETTER_QUEUE_NAME = 'editorial-discovery-dead-letter';
export const DISCOVERY_JOB_NAME = 'discover-source';
export const DISCOVERY_DEAD_LETTER_JOB_NAME = 'discovery-failed';
export const DISCOVERY_JOB_ATTEMPTS = 3;

export interface DiscoveryJobData {
  discoverySourceId: string;
  scheduledFor: string;
  trigger: 'SCHEDULER' | 'MANUAL';
}

export interface DiscoveryDeadLetterJobData extends DiscoveryJobData {
  originalJobId: string | null;
  failedAt: string;
  attemptsMade: number;
  error: string;
}

export interface DiscoveryQueues {
  discoveryQueue: Queue<DiscoveryJobData>;
  deadLetterQueue: Queue<DiscoveryDeadLetterJobData>;
}

export function createDiscoveryRedisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export function createDiscoveryQueues(connection: ConnectionOptions): DiscoveryQueues {
  return {
    discoveryQueue: new Queue<DiscoveryJobData>(DISCOVERY_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: DISCOVERY_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 100,
        removeOnFail: 250,
      },
    }),
    deadLetterQueue: new Queue<DiscoveryDeadLetterJobData>(DISCOVERY_DEAD_LETTER_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      },
    }),
  };
}

export function buildDiscoveryJobId(discoverySourceId: string, scheduledFor: Date): string {
  if (!discoverySourceId.trim()) throw new Error('discoverySourceId is required');
  if (Number.isNaN(scheduledFor.getTime())) throw new Error('scheduledFor must be a valid Date');
  const sourceHash = createHash('sha256').update(discoverySourceId).digest('hex').slice(0, 20);
  return `discovery-${sourceHash}-${scheduledFor.getTime()}`;
}

export function buildDiscoveryDeadLetterJobId(
  originalJobId: string | undefined,
  attemptsMade: number,
): string {
  const identity = `${originalJobId ?? 'unknown'}:${attemptsMade}`;
  return `discovery-dlq-${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
}
