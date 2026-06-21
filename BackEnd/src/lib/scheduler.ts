import type { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import type { Redis } from 'ioredis';
import { NEWS_SITEMAPS } from './news-sitemaps.js';
import { getNewsIngestionQueue } from './queue.js';
import logger from './logger.js';
import { recalculateBridgingScores } from '../services/bridgingService.js';

const log = logger.child({ module: 'Scheduler' });
const SCHEDULER_LOCK_KEY = 'epion:scheduler:singleton';
const SCHEDULER_LOCK_TTL_MS = 60_000;
const BRIDGING_SCORE_INTERVAL_MS = 5 * 60 * 1000;

export const RECURRING_NEWS_JOBS = [
  {
    id: 'news:discover-gdelt:french:2h',
    name: 'discover-gdelt',
    data: {
      query: 'lang:French',
      maxRecords: 15,
    },
    repeat: {
      pattern: '0 */2 * * *',
    },
  },
  {
    id: 'news:discover-sitemap:permissive:daily-0330',
    name: 'discover-sitemap',
    data: {
      sitemapUrl: NEWS_SITEMAPS.permissive.url,
      maxUrls: 100,
    },
    repeat: {
      pattern: '30 3 * * *',
    },
  },
] as const;

type RepeatableJob = {
  key: string;
  name: string;
  id?: string | null;
  pattern?: string | null;
  every?: number | null;
};

export type SchedulerHandle = {
  close: () => void | Promise<void>;
};

function isManagedRepeatable(job: RepeatableJob): boolean {
  return RECURRING_NEWS_JOBS.some((desired) => desired.name === job.name);
}

function matchesDesiredRepeatable(job: RepeatableJob): boolean {
  return RECURRING_NEWS_JOBS.some((desired) => (
    desired.name === job.name &&
    job.id === desired.id &&
    job.pattern === desired.repeat.pattern
  ));
}

export async function scheduleRecurringNewsJobs(queue: Queue = getNewsIngestionQueue()): Promise<void> {
  const existingRepeatables = await queue.getRepeatableJobs();

  for (const job of existingRepeatables as RepeatableJob[]) {
    if (isManagedRepeatable(job) && !matchesDesiredRepeatable(job)) {
      await queue.removeRepeatableByKey(job.key);
      log.info('Removed stale repeatable news job', {
        name: job.name,
        id: job.id,
        pattern: job.pattern,
        key: job.key,
      });
    }
  }

  for (const job of RECURRING_NEWS_JOBS) {
    await queue.add(job.name, job.data, {
      jobId: job.id,
      repeat: job.repeat,
    });
    log.info('Scheduled repeatable news job', {
      name: job.name,
      jobId: job.id,
      pattern: job.repeat.pattern,
    });
  }
}

export function startBridgingScoreScheduler(options: {
  intervalMs?: number;
  recalculate?: () => Promise<number>;
} = {}): SchedulerHandle {
  const intervalMs = options.intervalMs ?? BRIDGING_SCORE_INTERVAL_MS;
  const recalculate = options.recalculate ?? recalculateBridgingScores;

  const interval = setInterval(() => {
    recalculate()
      .then((processed) => {
        if (processed > 0) {
          log.info('Periodic bridging score recalculation complete', { processed });
        }
      })
      .catch((err: any) => {
        log.warn('Periodic bridging score recalculation failed', {
          error: err.message,
        });
      });
  }, intervalMs);
  interval.unref();

  log.info('Bridging score scheduler started', { intervalMs });

  return {
    close: () => clearInterval(interval),
  };
}

export async function acquireSchedulerLock(redis: Redis, options: { onLost?: () => void } = {}): Promise<SchedulerHandle> {
  const token = randomUUID();
  const acquired = await redis.set(SCHEDULER_LOCK_KEY, token, 'PX', SCHEDULER_LOCK_TTL_MS, 'NX');

  if (acquired !== 'OK') {
    throw new Error('Scheduler lock is already held by another process');
  }

  let lockLost = false;
  const heartbeat = setInterval(() => {
    redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
      1,
      SCHEDULER_LOCK_KEY,
      token,
      SCHEDULER_LOCK_TTL_MS,
    ).then((renewed) => {
      if (renewed !== 1 && !lockLost) {
        lockLost = true;
        clearInterval(heartbeat);
        log.error('Scheduler lock lost; shutting down scheduler', { key: SCHEDULER_LOCK_KEY });
        options.onLost?.();
      }
    }).catch((error: any) => {
      log.error('Scheduler lock heartbeat failed', { error: error?.message });
    });
  }, Math.floor(SCHEDULER_LOCK_TTL_MS / 2));
  heartbeat.unref();

  log.info('Scheduler lock acquired', { key: SCHEDULER_LOCK_KEY });

  return {
    close: async () => {
      clearInterval(heartbeat);
      await redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        SCHEDULER_LOCK_KEY,
        token,
      );
      log.info('Scheduler lock released', { key: SCHEDULER_LOCK_KEY });
    },
  };
}