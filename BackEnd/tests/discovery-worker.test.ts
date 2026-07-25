import type { Job } from 'bullmq';
import { DelayedError, UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import {
  DiscoveryConnectorRegistry,
  discoveryConnectorRegistry,
} from '../src/lib/discovery/connector-registry.js';
import { DiscoveryConnectorConfigError } from '../src/lib/discovery/connectors/config.js';
import { DiscoveryMetrics } from '../src/lib/discovery/discovery-metrics.js';
import type {
  DiscoveryOrchestratorClient,
  runDiscoverySource,
  recordDiscoveryFailure,
} from '../src/lib/discovery/discovery-orchestrator.js';
import { DiscoverySourceUnavailableError } from '../src/lib/discovery/discovery-orchestrator.js';
import type { DiscoveryJobData } from '../src/lib/discovery/discovery-queue.js';
import type { DiscoveryRedis } from '../src/lib/discovery/redis-lock.js';
import { resolveDiscoveryRuntimeFlags } from '../src/lib/discovery/runtime-flags.js';
import {
  buildDiscoveryDeadLetterData,
  createDiscoveryJobProcessor,
  isTerminalDiscoveryJobFailure,
} from '../src/workers/discovery.worker.js';
import { createWorkerDiscoveryConnectorRegistry } from '../src/workers/discovery-bootstrap.js';

class WorkerRedis implements DiscoveryRedis {
  lockAvailable = true;
  killValue: string | null = null;
  releaseCount = 0;

  async set(): Promise<string | null> {
    return this.lockAvailable ? 'OK' : null;
  }

  async get(): Promise<string | null> {
    return this.killValue;
  }

  async eval(): Promise<number> {
    this.releaseCount++;
    return 1;
  }
}

function flags(overrides: NodeJS.ProcessEnv = {}) {
  return resolveDiscoveryRuntimeFlags({
    DISCOVERY_ENABLED: 'true',
    DISCOVERY_KILL_SWITCH: 'false',
    ...overrides,
  });
}

function job(overrides: Partial<Job<DiscoveryJobData>> = {}): Job<DiscoveryJobData> {
  return {
    id: 'job-1',
    data: {
      discoverySourceId: 'source-1',
      scheduledFor: '2026-07-18T12:00:00.000Z',
      trigger: 'SCHEDULER',
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
    token: 'token',
    moveToDelayed: vi.fn(async () => undefined),
    ...overrides,
  } as Job<DiscoveryJobData>;
}

function dependencies(redis: WorkerRedis, overrides: Record<string, unknown> = {}) {
  return {
    client: {} as DiscoveryOrchestratorClient,
    registry: new DiscoveryConnectorRegistry(),
    redis,
    flags: flags(),
    metrics: new DiscoveryMetrics(),
    ...overrides,
  };
}

describe('dedicated discovery worker processor', () => {
  it('bootstraps connectors in a worker-local registry only', () => {
    expect(createWorkerDiscoveryConnectorRegistry().registeredTypes()).toEqual([
      'RSS',
      'ATOM',
      'SITEMAP',
      'SITEMAP_INDEX',
      'GDELT',
      'GOOGLE_NEWS_RSS',
    ]);
    expect(discoveryConnectorRegistry.registeredTypes()).toEqual([]);
  });

  it('skips jobs while the environment kill switch is active', async () => {
    const redis = new WorkerRedis();
    const runSource = vi.fn();
    const processor = createDiscoveryJobProcessor(dependencies(redis, {
      flags: flags({ DISCOVERY_KILL_SWITCH: 'true' }),
      runSource,
    }));

    const queuedJob = job();
    await expect(processor(queuedJob, 'token')).rejects.toBeInstanceOf(DelayedError);
    expect(runSource).not.toHaveBeenCalled();
    expect(queuedJob.moveToDelayed).toHaveBeenCalledOnce();
  });

  it('skips duplicate source execution when the per-source lock is held', async () => {
    const redis = new WorkerRedis();
    redis.lockAvailable = false;
    const runSource = vi.fn();
    const metrics = new DiscoveryMetrics();
    const processor = createDiscoveryJobProcessor(dependencies(redis, { runSource, metrics }));

    const queuedJob = job();
    await expect(processor(queuedJob, 'token')).rejects.toBeInstanceOf(DelayedError);
    expect(runSource).not.toHaveBeenCalled();
    expect(queuedJob.moveToDelayed).toHaveBeenCalledOnce();
    expect(metrics.snapshot().sourceLockMisses).toBe(1);
  });

  it('runs one source and always releases its execution lock', async () => {
    const redis = new WorkerRedis();
    const runSource = vi.fn(async () => ({ ok: true })) as unknown as typeof runDiscoverySource;
    const processor = createDiscoveryJobProcessor(dependencies(redis, { runSource }));

    await expect(processor(job(), 'token')).resolves.toEqual({ ok: true });
    expect(runSource).toHaveBeenCalledWith(
      expect.objectContaining({ registry: expect.any(DiscoveryConnectorRegistry) }),
      'source-1',
      { signal: expect.any(AbortSignal) },
    );
    expect(redis.releaseCount).toBe(1);
  });

  it('persists terminal failure state on the final retry', async () => {
    const redis = new WorkerRedis();
    const failure = new Error('network down');
    const runSource = vi.fn(async () => { throw failure; }) as unknown as typeof runDiscoverySource;
    const recordFailure = vi.fn(async () => ({
      consecutiveFailures: 1,
      disabled: false,
      nextRunAt: new Date(),
      disabledReason: null,
    })) as unknown as typeof recordDiscoveryFailure;
    const processor = createDiscoveryJobProcessor(dependencies(redis, {
      runSource,
      recordFailure,
    }));

    await expect(processor(job({ attemptsMade: 2 }), 'token')).rejects.toThrow('network down');
    expect(recordFailure).toHaveBeenCalledWith(
      expect.anything(),
      'source-1',
      failure,
    );
    expect(redis.releaseCount).toBe(1);
  });

  it('marks connector configuration errors as unrecoverable', async () => {
    const redis = new WorkerRedis();
    const runSource = vi.fn(async () => {
      throw new DiscoveryConnectorConfigError('bad config');
    }) as unknown as typeof runDiscoverySource;
    const recordFailure = vi.fn(async () => ({
      consecutiveFailures: 1,
      disabled: false,
      nextRunAt: new Date(),
      disabledReason: null,
    })) as unknown as typeof recordDiscoveryFailure;
    const processor = createDiscoveryJobProcessor(dependencies(redis, {
      runSource,
      recordFailure,
    }));

    await expect(processor(job(), 'token')).rejects.toBeInstanceOf(UnrecoverableError);
    expect(recordFailure).toHaveBeenCalledOnce();
  });

  it('does not overwrite state when a queued source was manually disabled', async () => {
    const redis = new WorkerRedis();
    const runSource = vi.fn(async () => {
      throw new DiscoverySourceUnavailableError('source disabled');
    }) as unknown as typeof runDiscoverySource;
    const recordFailure = vi.fn() as unknown as typeof recordDiscoveryFailure;
    const processor = createDiscoveryJobProcessor(dependencies(redis, {
      runSource,
      recordFailure,
    }));

    await expect(processor(job(), 'token')).rejects.toBeInstanceOf(UnrecoverableError);
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it('builds a bounded dead-letter record only for terminal jobs', () => {
    const terminalJob = job({ attemptsMade: 3 });
    const failedAt = new Date('2026-07-18T12:30:00Z');
    const longError = new Error('x'.repeat(2_000));

    expect(isTerminalDiscoveryJobFailure(terminalJob, longError)).toBe(true);
    expect(isTerminalDiscoveryJobFailure(job({ attemptsMade: 1 }), longError)).toBe(false);
    expect(buildDiscoveryDeadLetterData(terminalJob, longError, failedAt)).toEqual({
      ...terminalJob.data,
      originalJobId: 'job-1',
      failedAt: '2026-07-18T12:30:00.000Z',
      attemptsMade: 3,
      error: 'x'.repeat(1_000),
    });
  });
});
