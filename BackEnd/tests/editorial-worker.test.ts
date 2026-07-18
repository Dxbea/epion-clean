import type { PrismaClient } from '@prisma/client';
import { DelayedError, UnrecoverableError, type Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { resolveEditorialClusteringConfig } from '../src/lib/editorial-shadow/editorial-run-service.js';
import { EditorialShadowMetrics } from '../src/lib/editorial-shadow/editorial-metrics.js';
import {
  buildEditorialShadowJobId,
  enqueueEditorialShadowJob,
  prepareEditorialShadowJob,
  type EditorialShadowJobData,
} from '../src/lib/editorial-shadow/editorial-queue.js';
import { resolveEditorialShadowRuntimeFlags } from '../src/lib/editorial-shadow/runtime-flags.js';
import type { DiscoveryRedis } from '../src/lib/discovery/redis-lock.js';
import {
  buildEditorialShadowDeadLetterData,
  createEditorialShadowJobProcessor,
  isTerminalEditorialShadowFailure,
} from '../src/workers/editorial-shadow.worker.js';

class WorkerRedis implements DiscoveryRedis {
  lockAvailable = true;
  killValue: string | null = null;
  releases = 0;

  async set(): Promise<string | null> {
    return this.lockAvailable ? 'OK' : null;
  }

  async get(): Promise<string | null> {
    return this.killValue;
  }

  async eval(): Promise<number> {
    this.releases++;
    return 1;
  }
}

const config = resolveEditorialClusteringConfig();
const windowStart = new Date('2026-07-17T12:00:00Z');
const windowEnd = new Date('2026-07-18T12:00:00Z');

function data(): EditorialShadowJobData {
  const embeddingModel = 'text-embedding-3-small';
  return prepareEditorialShadowJob({
    windowStart,
    windowEnd,
    embeddingModel,
    config,
    requestedAt: new Date('2026-07-18T12:30:00.000Z'),
    trigger: 'MANUAL',
  });
}

function job(overrides: Partial<Job<EditorialShadowJobData>> = {}): Job<EditorialShadowJobData> {
  return {
    id: 'job-1',
    data: data(),
    attemptsMade: 0,
    opts: { attempts: 3 },
    token: 'token',
    moveToDelayed: vi.fn(async () => undefined),
    ...overrides,
  } as Job<EditorialShadowJobData>;
}

function flags(overrides: NodeJS.ProcessEnv = {}) {
  return resolveEditorialShadowRuntimeFlags({
    EDITORIAL_SHADOW_ENABLED: 'true',
    EDITORIAL_SHADOW_KILL_SWITCH: 'false',
    ...overrides,
  });
}

describe('dedicated editorial shadow worker', () => {
  it('defaults to fully disabled and validates runtime flags', () => {
    expect(resolveEditorialShadowRuntimeFlags({})).toMatchObject({
      enabled: false,
      killSwitch: true,
      workerConcurrency: 1,
    });
    expect(() => resolveEditorialShadowRuntimeFlags({
      EDITORIAL_SHADOW_WORKER_CONCURRENCY: '0',
    })).toThrow('EDITORIAL_SHADOW_WORKER_CONCURRENCY');
  });

  it('uses the run identity for stable BullMQ deduplication', async () => {
    const queue = { add: vi.fn(async () => ({})) };
    const payload = data();
    await enqueueEditorialShadowJob(queue, payload);
    await enqueueEditorialShadowJob(queue, payload);
    expect(queue.add.mock.calls[0][2].jobId).toBe(queue.add.mock.calls[1][2].jobId);
    expect(queue.add.mock.calls[0][2].jobId).toBe(buildEditorialShadowJobId(payload.idempotencyKey));
  });

  it('delays work while the kill switch is active', async () => {
    const redis = new WorkerRedis();
    const runShadow = vi.fn();
    const queuedJob = job();
    const processor = createEditorialShadowJobProcessor({
      client: {} as PrismaClient,
      redis,
      flags: flags({ EDITORIAL_SHADOW_KILL_SWITCH: 'true' }),
      metrics: new EditorialShadowMetrics(),
      runShadow,
    });

    await expect(processor(queuedJob, 'token')).rejects.toBeInstanceOf(DelayedError);
    expect(runShadow).not.toHaveBeenCalled();
    expect(queuedJob.moveToDelayed).toHaveBeenCalledOnce();
  });

  it('rejects a payload whose deterministic identity does not match', async () => {
    const processor = createEditorialShadowJobProcessor({
      client: {} as PrismaClient,
      redis: new WorkerRedis(),
      flags: flags(),
      metrics: new EditorialShadowMetrics(),
    });
    const queuedJob = job({ data: { ...data(), idempotencyKey: 'wrong' } });
    await expect(processor(queuedJob, 'token')).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('prevents concurrent processing with a per-run Redis lock', async () => {
    const redis = new WorkerRedis();
    redis.lockAvailable = false;
    const metrics = new EditorialShadowMetrics();
    const runShadow = vi.fn();
    const queuedJob = job();
    const processor = createEditorialShadowJobProcessor({
      client: {} as PrismaClient,
      redis,
      flags: flags(),
      metrics,
      runShadow,
    });

    await expect(processor(queuedJob, 'token')).rejects.toBeInstanceOf(DelayedError);
    expect(runShadow).not.toHaveBeenCalled();
    expect(metrics.snapshot().runLockMisses).toBe(1);
  });

  it('records shadow metrics and releases the lock after success', async () => {
    const redis = new WorkerRedis();
    const metrics = new EditorialShadowMetrics();
    const runShadow = vi.fn(async () => ({
      runId: 'run-1',
      idempotencyKey: data().idempotencyKey,
      outcome: 'COMPLETED' as const,
      documentsConsidered: 12,
      topicsCreated: 4,
      candidatesCreated: 4,
      proposedCandidates: 2,
      suppressedCandidates: 2,
      quasiDuplicates: 3,
      durationMs: 80,
    }));
    const processor = createEditorialShadowJobProcessor({
      client: {} as PrismaClient,
      redis,
      flags: flags(),
      metrics,
      runShadow,
    });

    await expect(processor(job(), 'token')).resolves.toMatchObject({ outcome: 'COMPLETED' });
    expect(redis.releases).toBe(1);
    expect(metrics.snapshot()).toMatchObject({
      jobsStarted: 1,
      jobsSucceeded: 1,
      documentsConsidered: 12,
      topicsCreated: 4,
      proposedCandidates: 2,
      quasiDuplicates: 3,
    });
  });

  it('bounds DLQ records and recognizes terminal attempts', () => {
    const failedJob = job({ attemptsMade: 3 });
    const error = new Error('x'.repeat(2_000));
    expect(isTerminalEditorialShadowFailure(failedJob, error)).toBe(true);
    expect(isTerminalEditorialShadowFailure(job({ attemptsMade: 1 }), error)).toBe(false);
    expect(buildEditorialShadowDeadLetterData(
      failedJob,
      error,
      new Date('2026-07-18T13:00:00Z'),
    )).toMatchObject({
      originalJobId: 'job-1',
      attemptsMade: 3,
      failedAt: '2026-07-18T13:00:00.000Z',
      error: 'x'.repeat(1_000),
    });
  });
});
