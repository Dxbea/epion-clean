import { describe, expect, it, vi } from 'vitest';
import { DiscoveryMetrics } from '../src/lib/discovery/discovery-metrics.js';
import {
  buildDiscoveryDeadLetterJobId,
  buildDiscoveryJobId,
} from '../src/lib/discovery/discovery-queue.js';
import {
  calculateDiscoveryFailureRetry,
  calculateNextDiscoveryRun,
  parseDiscoveryInterval,
} from '../src/lib/discovery/discovery-schedule.js';
import {
  DISCOVERY_SCHEDULER_LOCK_KEY,
  enqueueDueDiscoveryJobs,
} from '../src/lib/discovery/discovery-scheduler.js';
import type { DiscoveryRedis } from '../src/lib/discovery/redis-lock.js';
import { resolveDiscoveryRuntimeFlags } from '../src/lib/discovery/runtime-flags.js';

class FakeRedis implements DiscoveryRedis {
  lockAvailable = true;
  killValue: string | null = null;
  releasedKeys: string[] = [];

  async set(key: string, _value: string): Promise<string | null> {
    return this.lockAvailable ? 'OK' : null;
  }

  async get(): Promise<string | null> {
    return this.killValue;
  }

  async eval(_script: string, _numberOfKeys: number, key: string): Promise<number> {
    this.releasedKeys.push(key);
    return 1;
  }
}

describe('discovery runtime controls', () => {
  it('is disabled and killed by default', () => {
    expect(resolveDiscoveryRuntimeFlags({})).toMatchObject({
      enabled: false,
      schedulerEnabled: false,
      killSwitch: true,
      workerConcurrency: 1,
    });
  });

  it('requires explicit and valid runtime flags', () => {
    expect(resolveDiscoveryRuntimeFlags({
      DISCOVERY_ENABLED: 'true',
      DISCOVERY_SCHEDULER_ENABLED: 'true',
      DISCOVERY_KILL_SWITCH: 'false',
      DISCOVERY_WORKER_CONCURRENCY: '2',
    })).toMatchObject({
      enabled: true,
      schedulerEnabled: true,
      killSwitch: false,
      workerConcurrency: 2,
    });
    expect(() => resolveDiscoveryRuntimeFlags({ DISCOVERY_ENABLED: 'yes' }))
      .toThrow('DISCOVERY_ENABLED must be "true" or "false"');
  });

  it('computes bounded source schedules and exponential failure retries', () => {
    const from = new Date('2026-07-18T12:00:00Z');

    expect(parseDiscoveryInterval(null, 'RSS')).toBe(15 * 60_000);
    expect(calculateNextDiscoveryRun('@every 2h', 'RSS', from).toISOString())
      .toBe('2026-07-18T14:00:00.000Z');
    expect(calculateDiscoveryFailureRetry(1, from).toISOString())
      .toBe('2026-07-18T12:05:00.000Z');
    expect(calculateDiscoveryFailureRetry(4, from).toISOString())
      .toBe('2026-07-18T12:40:00.000Z');
    expect(() => parseDiscoveryInterval('0 */2 * * *', 'RSS'))
      .toThrow('Discovery schedule must use');
  });

  it('builds deterministic BullMQ-safe job IDs', () => {
    const scheduledFor = new Date('2026-07-18T12:00:00Z');
    const first = buildDiscoveryJobId('source:with:colons', scheduledFor);
    const second = buildDiscoveryJobId('source:with:colons', scheduledFor);

    expect(first).toBe(second);
    expect(first).not.toContain(':');
    expect(buildDiscoveryDeadLetterJobId(first, 3))
      .toBe(buildDiscoveryDeadLetterJobId(first, 3));
  });

  it('enqueues due sources under one scheduler lock with stable IDs', async () => {
    const redis = new FakeRedis();
    const queue = { add: vi.fn(async () => ({})) };
    const dueAt = new Date('2026-07-18T11:00:00Z');
    const client = {
      discoverySource: {
        findMany: vi.fn(async () => [
          { id: 'source-1', nextRunAt: dueAt },
          { id: 'source-2', nextRunAt: null },
        ]),
      },
    };
    const flags = resolveDiscoveryRuntimeFlags({
      DISCOVERY_ENABLED: 'true',
      DISCOVERY_SCHEDULER_ENABLED: 'true',
      DISCOVERY_KILL_SWITCH: 'false',
    });

    const result = await enqueueDueDiscoveryJobs({ client, queue, redis, flags }, new Date(
      '2026-07-18T12:00:00Z',
    ));

    expect(result).toEqual({
      disabled: false,
      lockAcquired: true,
      killed: false,
      sourcesDue: 2,
      jobsEnqueued: 2,
    });
    expect(queue.add.mock.calls[0][2]?.jobId)
      .toBe(buildDiscoveryJobId('source-1', dueAt));
    expect(queue.add.mock.calls[1][2]?.jobId)
      .toBe(buildDiscoveryJobId('source-2', new Date(0)));
    expect(redis.releasedKeys).toEqual([DISCOVERY_SCHEDULER_LOCK_KEY]);
  });

  it('skips a scheduler tick when another scheduler owns the lock', async () => {
    const redis = new FakeRedis();
    redis.lockAvailable = false;
    const metrics = new DiscoveryMetrics();
    const client = { discoverySource: { findMany: vi.fn() } };
    const queue = { add: vi.fn() };
    const flags = resolveDiscoveryRuntimeFlags({
      DISCOVERY_ENABLED: 'true',
      DISCOVERY_SCHEDULER_ENABLED: 'true',
      DISCOVERY_KILL_SWITCH: 'false',
    });

    await expect(enqueueDueDiscoveryJobs({ client, queue, redis, flags, metrics }))
      .resolves.toMatchObject({ disabled: false, lockAcquired: false, killed: false });
    expect(client.discoverySource.findMany).not.toHaveBeenCalled();
    expect(metrics.snapshot().schedulerLockMisses).toBe(1);
  });

  it('does not query or enqueue while the scheduler feature flag is disabled', async () => {
    const redis = new FakeRedis();
    const client = { discoverySource: { findMany: vi.fn() } };
    const queue = { add: vi.fn() };
    const flags = resolveDiscoveryRuntimeFlags({
      DISCOVERY_ENABLED: 'true',
      DISCOVERY_KILL_SWITCH: 'false',
    });

    await expect(enqueueDueDiscoveryJobs({ client, queue, redis, flags }))
      .resolves.toMatchObject({ disabled: true, jobsEnqueued: 0 });
    expect(client.discoverySource.findMany).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
