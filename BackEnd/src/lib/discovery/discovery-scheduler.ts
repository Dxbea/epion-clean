import type { Prisma } from '@prisma/client';
import type { JobsOptions } from 'bullmq';
import logger from '../logger.js';
import { DiscoveryMetrics } from './discovery-metrics.js';
import {
  buildDiscoveryJobId,
  DISCOVERY_JOB_NAME,
  type DiscoveryJobData,
} from './discovery-queue.js';
import {
  acquireRedisLock,
  isRedisKillSwitchActive,
  type DiscoveryRedis,
} from './redis-lock.js';
import {
  DISCOVERY_REDIS_KILL_SWITCH_KEY,
  type DiscoveryRuntimeFlags,
} from './runtime-flags.js';

const schedulerLog = logger.child({ module: 'DiscoveryScheduler' });
export const DISCOVERY_SCHEDULER_LOCK_KEY = 'epion:discovery:scheduler-lock';
const MAX_SOURCES_PER_TICK = 100;

type SchedulerDiscoverySourceDelegate = Pick<
  Prisma.TransactionClient['discoverySource'],
  'findMany'
>;

export interface DiscoverySchedulerClient {
  discoverySource: SchedulerDiscoverySourceDelegate;
}

export interface DiscoverySchedulerQueue {
  add(
    name: typeof DISCOVERY_JOB_NAME,
    data: DiscoveryJobData,
    options: JobsOptions,
  ): Promise<unknown>;
}

export interface DiscoverySchedulerDependencies {
  client: DiscoverySchedulerClient;
  queue: DiscoverySchedulerQueue;
  redis: DiscoveryRedis;
  flags: DiscoveryRuntimeFlags;
  metrics?: DiscoveryMetrics;
}

export interface DiscoverySchedulerTickResult {
  disabled: boolean;
  lockAcquired: boolean;
  killed: boolean;
  sourcesDue: number;
  jobsEnqueued: number;
}

export async function enqueueDueDiscoveryJobs(
  dependencies: DiscoverySchedulerDependencies,
  now = new Date(),
): Promise<DiscoverySchedulerTickResult> {
  if (Number.isNaN(now.getTime())) throw new Error('Scheduler time must be a valid Date');
  if (!dependencies.flags.enabled || !dependencies.flags.schedulerEnabled) {
    return {
      disabled: true,
      lockAcquired: false,
      killed: false,
      sourcesDue: 0,
      jobsEnqueued: 0,
    };
  }
  if (dependencies.flags.killSwitch || await isRedisKillSwitchActive(
    dependencies.redis,
    DISCOVERY_REDIS_KILL_SWITCH_KEY,
  )) {
    return { disabled: false, lockAcquired: false, killed: true, sourcesDue: 0, jobsEnqueued: 0 };
  }

  const lock = await acquireRedisLock(
    dependencies.redis,
    DISCOVERY_SCHEDULER_LOCK_KEY,
    dependencies.flags.schedulerLockTtlMs,
  );
  if (!lock) {
    dependencies.metrics?.increment('schedulerLockMisses');
    return { disabled: false, lockAcquired: false, killed: false, sourcesDue: 0, jobsEnqueued: 0 };
  }

  try {
    const sources = await dependencies.client.discoverySource.findMany({
      where: {
        enabled: true,
        disabledReason: null,
        OR: [
          { nextRunAt: null },
          { nextRunAt: { lte: now } },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { nextRunAt: 'asc' },
      ],
      take: MAX_SOURCES_PER_TICK,
      select: { id: true, nextRunAt: true },
    });

    let jobsEnqueued = 0;
    for (const source of sources) {
      const scheduledFor = source.nextRunAt ?? now;
      const jobIdentityDate = source.nextRunAt ?? new Date(0);
      await dependencies.queue.add(
        DISCOVERY_JOB_NAME,
        {
          discoverySourceId: source.id,
          scheduledFor: scheduledFor.toISOString(),
          trigger: 'SCHEDULER',
        },
        {
          jobId: buildDiscoveryJobId(source.id, jobIdentityDate),
        },
      );
      jobsEnqueued++;
    }

    dependencies.metrics?.increment('jobsEnqueued', jobsEnqueued);
    schedulerLog.info('Discovery scheduler tick completed', {
      sourcesDue: sources.length,
      jobsEnqueued,
      schedulerTime: now.toISOString(),
    });
    return {
      disabled: false,
      lockAcquired: true,
      killed: false,
      sourcesDue: sources.length,
      jobsEnqueued,
    };
  } finally {
    await lock.release();
  }
}

export function startDiscoveryScheduler(
  dependencies: DiscoverySchedulerDependencies,
): NodeJS.Timeout {
  const tick = () => {
    enqueueDueDiscoveryJobs(dependencies).catch((error) => {
      schedulerLog.error('Discovery scheduler tick failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  tick();
  const interval = setInterval(tick, dependencies.flags.schedulerPollMs);
  interval.unref();
  return interval;
}
