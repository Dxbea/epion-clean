import type { PrismaClient } from '@prisma/client';
import { DelayedError, UnrecoverableError, type Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { EditorialDraftMetrics } from '../src/lib/editorial-draft/draft-metrics.js';
import { buildEditorialDraftJobId, enqueueEditorialDraftJob, prepareEditorialDraftJob, type EditorialDraftJobData } from '../src/lib/editorial-draft/draft-queue.js';
import { resolveEditorialDraftRuntimeFlags } from '../src/lib/editorial-draft/runtime-flags.js';
import type { DiscoveryRedis } from '../src/lib/discovery/redis-lock.js';
import { buildEditorialDraftDeadLetterData, createEditorialDraftProcessor, isTerminalEditorialDraftFailure } from '../src/workers/editorial-draft.worker.js';

class WorkerRedis implements DiscoveryRedis {
  lockAvailable = true;
  async set(): Promise<string | null> { return this.lockAvailable ? 'OK' : null; }
  async get(): Promise<string | null> { return null; }
  async eval(): Promise<number> { return 1; }
}

function data(): EditorialDraftJobData { return prepareEditorialDraftJob({ briefId: 'brief-1', generatorModel: 'g-test', criticModel: 'c-test', requestedAt: new Date('2026-07-18T12:00:00Z') }); }
function job(overrides: Partial<Job<EditorialDraftJobData>> = {}): Job<EditorialDraftJobData> { const payload = data(); return { id: buildEditorialDraftJobId(payload), data: payload, attemptsMade: 0, opts: { attempts: 3 }, token: 'token', moveToDelayed: vi.fn(async () => undefined), ...overrides } as Job<EditorialDraftJobData>; }
function flags(overrides: NodeJS.ProcessEnv = {}) { return resolveEditorialDraftRuntimeFlags({ EDITORIAL_DRAFT_ENABLED: 'true', EDITORIAL_DRAFT_KILL_SWITCH: 'false', ...overrides }); }

describe('dedicated controlled editorial draft worker', () => {
  it('is disabled by default with its kill switch active', () => {
    expect(resolveEditorialDraftRuntimeFlags({})).toMatchObject({ enabled: false, killSwitch: true, workerConcurrency: 1 });
  });

  it('uses deterministic jobs and delays when disabled or concurrently locked', async () => {
    const queue = { add: vi.fn(async () => ({})) };
    const payload = data();
    await enqueueEditorialDraftJob(queue, payload);
    await enqueueEditorialDraftJob(queue, payload);
    expect(queue.add.mock.calls[0][2].jobId).toBe(queue.add.mock.calls[1][2].jobId);
    const generateDraft = vi.fn();
    const killed = createEditorialDraftProcessor({ client: {} as PrismaClient, redis: new WorkerRedis(), flags: flags({ EDITORIAL_DRAFT_KILL_SWITCH: 'true' }), metrics: new EditorialDraftMetrics(), generateDraft });
    await expect(killed(job(), 'token')).rejects.toBeInstanceOf(DelayedError);
    const redis = new WorkerRedis(); redis.lockAvailable = false;
    const locked = createEditorialDraftProcessor({ client: {} as PrismaClient, redis, flags: flags(), metrics: new EditorialDraftMetrics(), generateDraft });
    await expect(locked(job(), 'token')).rejects.toBeInstanceOf(DelayedError);
    expect(generateDraft).not.toHaveBeenCalled();
  });

  it('rejects tampered payload identities', async () => {
    const processor = createEditorialDraftProcessor({ client: {} as PrismaClient, redis: new WorkerRedis(), flags: flags(), metrics: new EditorialDraftMetrics() });
    await expect(processor(job({ id: 'wrong-id' }), 'token')).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('runs only intermediate draft generation and records metrics', async () => {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
    const result = { draftId: 'draft-1', briefId: 'brief-1', outcome: 'READY_FOR_REVIEW' as const, qualityScore: 90, publishabilityScore: 88, claims: 3, inputTokens: 10, outputTokens: 5, estimatedCostMicros: 1 };
    const generateDraft = vi.fn(async () => result);
    const metrics = new EditorialDraftMetrics();
    const processor = createEditorialDraftProcessor({ client: {} as PrismaClient, redis: new WorkerRedis(), flags: flags(), metrics, generateDraft });
    await expect(processor(job(), 'token')).resolves.toEqual(result);
    expect(metrics.snapshot()).toMatchObject({ jobsStarted: 1, jobsSucceeded: 1, readyForReview: 1, claimsReviewed: 3 });
  });

  it('dead-letters terminal errors with bounded messages', () => {
    const queued = job({ attemptsMade: 3 });
    expect(isTerminalEditorialDraftFailure(queued, new Error('failure'))).toBe(true);
    expect(buildEditorialDraftDeadLetterData(queued, new Error('x'.repeat(2_000))).error).toHaveLength(1_000);
  });
});
