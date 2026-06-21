import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireSchedulerLock, RECURRING_NEWS_JOBS, scheduleRecurringNewsJobs } from '../src/lib/scheduler';

type RepeatableJob = {
  key: string;
  name: string;
  id?: string | null;
  pattern?: string | null;
};

function createFakeQueue(initialJobs: RepeatableJob[] = []) {
  const repeatables = new Map<string, RepeatableJob>();
  for (const job of initialJobs) {
    repeatables.set(job.key, job);
  }

  return {
    add: vi.fn(async (name: string, _data: unknown, options: any) => {
      const key = `${name}:${options.jobId}:${options.repeat.pattern}`;
      repeatables.set(key, {
        key,
        name,
        id: options.jobId,
        pattern: options.repeat.pattern,
      });
      return { id: options.jobId };
    }),
    getRepeatableJobs: vi.fn(async () => Array.from(repeatables.values())),
    removeRepeatableByKey: vi.fn(async (key: string) => {
      repeatables.delete(key);
    }),
    scheduledCount: () => repeatables.size,
    scheduledJobs: () => Array.from(repeatables.values()),
  };
}

describe('scheduleRecurringNewsJobs', () => {
  it('uses deterministic job ids and remains idempotent across repeated scheduling', async () => {
    const queue = createFakeQueue();

    await scheduleRecurringNewsJobs(queue as any);
    await scheduleRecurringNewsJobs(queue as any);

    expect(queue.scheduledCount()).toBe(RECURRING_NEWS_JOBS.length);
    for (const expected of RECURRING_NEWS_JOBS) {
      expect(queue.scheduledJobs()).toContainEqual(expect.objectContaining({
        name: expected.name,
        id: expected.id,
        pattern: expected.repeat.pattern,
      }));
    }
  });

  it('removes stale managed repeatables before adding desired jobs', async () => {
    const queue = createFakeQueue([
      {
        key: 'legacy-gdelt-key',
        name: 'discover-gdelt',
        id: null,
        pattern: '*/5 * * * *',
      },
    ]);

    await scheduleRecurringNewsJobs(queue as any);

    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('legacy-gdelt-key');
    expect(queue.scheduledCount()).toBe(RECURRING_NEWS_JOBS.length);
  });
});
describe('scheduler Redis lock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('acquires the lock atomically with NX and PX', async () => {
    const redis = {
      set: vi.fn(async () => 'OK'),
      eval: vi.fn(async () => 1),
    };

    const lock = await acquireSchedulerLock(redis as any);

    expect(redis.set).toHaveBeenCalledWith(
      'epion:scheduler:singleton',
      expect.any(String),
      'PX',
      60_000,
      'NX',
    );

    await lock.close();
  });

  it('renews TTL only while the scheduler still owns the token', async () => {
    vi.useFakeTimers();
    const redis = {
      set: vi.fn(async () => 'OK'),
      eval: vi.fn(async () => 1),
    };

    const lock = await acquireSchedulerLock(redis as any);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('pexpire'),
      1,
      'epion:scheduler:singleton',
      expect.any(String),
      60_000,
    );

    await lock.close();
  });

  it('notifies the process when the lock is lost', async () => {
    vi.useFakeTimers();
    const onLost = vi.fn();
    const redis = {
      set: vi.fn(async () => 'OK'),
      eval: vi.fn(async () => 0),
    };

    await acquireSchedulerLock(redis as any, { onLost });
    await vi.advanceTimersByTimeAsync(30_000);

    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it('releases the lock only if the token still belongs to the process', async () => {
    const redis = {
      set: vi.fn(async () => 'OK'),
      eval: vi.fn(async () => 0),
    };

    const lock = await acquireSchedulerLock(redis as any);
    await lock.close();

    expect(redis.eval).toHaveBeenLastCalledWith(
      expect.stringContaining("redis.call('get', KEYS[1]) == ARGV[1]"),
      1,
      'epion:scheduler:singleton',
      expect.any(String),
    );
  });

  it('allows a later process to acquire the scheduler lock after a crash TTL expiry', async () => {
    let lockValue: string | null = null;
    const redis = {
      set: vi.fn(async (_key: string, token: string, _px: string, _ttl: number, mode: string) => {
        if (mode === 'NX' && lockValue) return null;
        lockValue = token;
        return 'OK';
      }),
      eval: vi.fn(async () => 1),
      expireCrashLock: () => {
        lockValue = null;
      },
    };

    await acquireSchedulerLock(redis as any);
    await expect(acquireSchedulerLock(redis as any)).rejects.toThrow('Scheduler lock is already held');

    redis.expireCrashLock();
    await expect(acquireSchedulerLock(redis as any)).resolves.toBeTruthy();
  });
});