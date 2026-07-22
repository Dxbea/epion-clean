import type { PrismaClient } from '@prisma/client';
import { DelayedError, UnrecoverableError, type Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { EditorialBriefMetrics } from '../src/lib/editorial-brief/brief-metrics.js';
import { buildEditorialBriefJobId, enqueueEditorialBriefJob, prepareEditorialBriefJob, type EditorialBriefJobData } from '../src/lib/editorial-brief/brief-queue.js';
import { resolveEditorialBriefRuntimeFlags } from '../src/lib/editorial-brief/runtime-flags.js';
import type { DiscoveryRedis } from '../src/lib/discovery/redis-lock.js';
import { buildEditorialBriefDeadLetterData, createEditorialBriefJobProcessor, isTerminalEditorialBriefFailure } from '../src/workers/editorial-brief.worker.js';

class WorkerRedis implements DiscoveryRedis {
  lockAvailable = true;
  killValue: string | null = null;
  async set(): Promise<string | null> { return this.lockAvailable ? 'OK' : null; }
  async get(): Promise<string | null> { return this.killValue; }
  async eval(): Promise<number> { return 1; }
}

function data(): EditorialBriefJobData {
  return prepareEditorialBriefJob({ editorialRunId: 'run-1', generatorModel: 'test-model', requestedAt: new Date('2026-07-18T12:00:00Z') });
}

function job(overrides: Partial<Job<EditorialBriefJobData>> = {}): Job<EditorialBriefJobData> {
  const payload = data();
  return { id: buildEditorialBriefJobId(payload), data: payload, attemptsMade: 0, opts: { attempts: 3 }, token: 'token', moveToDelayed: vi.fn(async () => undefined), ...overrides } as Job<EditorialBriefJobData>;
}

function flags(overrides: NodeJS.ProcessEnv = {}) {
  return resolveEditorialBriefRuntimeFlags({ EDITORIAL_BRIEF_ENABLED: 'true', EDITORIAL_BRIEF_KILL_SWITCH: 'false', ...overrides });
}

describe('dedicated editorial brief worker', () => {
  it('defaults to disabled with the kill switch active', () => {
    expect(resolveEditorialBriefRuntimeFlags({})).toMatchObject({ enabled: false, killSwitch: true, workerConcurrency: 1 });
  });

  it('uses deterministic BullMQ job IDs', async () => {
    const queue = { add: vi.fn(async () => ({})) };
    const payload = data();
    await enqueueEditorialBriefJob(queue, payload);
    await enqueueEditorialBriefJob(queue, payload);
    expect(queue.add.mock.calls[0][2].jobId).toBe(buildEditorialBriefJobId(payload));
    expect(queue.add.mock.calls[1][2].jobId).toBe(queue.add.mock.calls[0][2].jobId);
  });

  it('keeps a controlled prod-shadow brief job distinct and forwards its strict flag', async () => {
    const normal = prepareEditorialBriefJob({ editorialRunId: 'run-1', generatorModel: 'test-model', requestedAt: new Date('2026-07-18T12:00:00Z') });
    const controlled = prepareEditorialBriefJob({
      editorialRunId: 'run-1',
      generatorModel: 'test-model',
      requestedAt: new Date('2026-07-18T12:00:00Z'),
      prodShadowControlled: true,
      config: { maximumDocuments: 1, maximumCandidates: 1 },
    });
    expect(buildEditorialBriefJobId(controlled)).not.toBe(buildEditorialBriefJobId(normal));

    const runBatch = vi.fn(async () => ({ editorialRunId: 'run-1', selectedCandidates: 1, completed: 1, alreadyCompleted: 0, blocked: 0, evidenceChunks: 1, durationMs: 1, results: [], selectionDiagnostics: [] }));
    const processor = createEditorialBriefJobProcessor({ client: {} as PrismaClient, redis: new WorkerRedis(), flags: flags(), metrics: new EditorialBriefMetrics(), runBatch });
    await processor({ id: buildEditorialBriefJobId(controlled), data: controlled, attemptsMade: 0, opts: { attempts: 3 }, token: 'token', moveToDelayed: vi.fn(async () => undefined) } as Job<EditorialBriefJobData>, 'token');
    expect(runBatch).toHaveBeenCalledWith(expect.anything(), 'run-1', expect.objectContaining({ prodShadowControlled: true, config: expect.objectContaining({ maximumDocuments: 1 }) }));
  });

  it('delays work while the local kill switch is active', async () => {
    const queuedJob = job();
    const runBatch = vi.fn();
    const processor = createEditorialBriefJobProcessor({ client: {} as PrismaClient, redis: new WorkerRedis(), flags: flags({ EDITORIAL_BRIEF_KILL_SWITCH: 'true' }), metrics: new EditorialBriefMetrics(), runBatch });
    await expect(processor(queuedJob, 'token')).rejects.toBeInstanceOf(DelayedError);
    expect(runBatch).not.toHaveBeenCalled();
  });

  it('rejects payload tampering before acquiring work', async () => {
    const processor = createEditorialBriefJobProcessor({ client: {} as PrismaClient, redis: new WorkerRedis(), flags: flags(), metrics: new EditorialBriefMetrics() });
    const queuedJob = job({ id: 'wrong-job-id' });
    await expect(processor(queuedJob, 'token')).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('delays concurrent work when another worker owns the run lock', async () => {
    const redis = new WorkerRedis();
    redis.lockAvailable = false;
    const runBatch = vi.fn();
    const processor = createEditorialBriefJobProcessor({ client: {} as PrismaClient, redis, flags: flags(), metrics: new EditorialBriefMetrics(), runBatch });
    await expect(processor(job(), 'token')).rejects.toBeInstanceOf(DelayedError);
    expect(runBatch).not.toHaveBeenCalled();
  });

  it('runs a batch under a per-run lock and records metrics', async () => {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
    const result = { editorialRunId: 'run-1', selectedCandidates: 1, completed: 1, alreadyCompleted: 0, blocked: 0, evidenceChunks: 3, durationMs: 5, results: [] };
    const runBatch = vi.fn(async () => result);
    const metrics = new EditorialBriefMetrics();
    const processor = createEditorialBriefJobProcessor({ client: {} as PrismaClient, redis: new WorkerRedis(), flags: flags(), metrics, runBatch });
    await expect(processor(job(), 'token')).resolves.toEqual(result);
    expect(runBatch).toHaveBeenCalledOnce();
    expect(metrics.snapshot()).toMatchObject({ jobsStarted: 1, jobsSucceeded: 1, evidenceChunks: 3 });
  });

  it('dead-letters terminal failures with bounded errors', () => {
    const queuedJob = job({ attemptsMade: 3 });
    expect(isTerminalEditorialBriefFailure(queuedJob, new Error('failure'))).toBe(true);
    expect(buildEditorialBriefDeadLetterData(queuedJob, new Error('x'.repeat(2_000))).error).toHaveLength(1_000);
  });
});
