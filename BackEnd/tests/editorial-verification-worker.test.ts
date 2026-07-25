import type { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { DelayedError, UnrecoverableError, type Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { EditorialVerificationBudgetExceededError, type EditorialVerificationBudgetService } from '../src/lib/editorial-verification/budget-service.js';
import { resolveEditorialVerificationRuntimeFlags } from '../src/lib/editorial-verification/runtime-flags.js';
import { EditorialVerificationMetrics } from '../src/lib/editorial-verification/verification-metrics.js';
import {
  buildEditorialVerificationJobId,
  prepareEditorialVerificationJob,
  type EditorialVerificationJobData,
} from '../src/lib/editorial-verification/verification-queue.js';
import type { DiscoveryRedis } from '../src/lib/discovery/redis-lock.js';
import {
  buildEditorialVerificationDeadLetterData,
  createEditorialVerificationProcessor,
  isTerminalEditorialVerificationFailure,
} from '../src/workers/editorial-verification.worker.js';

class WorkerRedis implements DiscoveryRedis {
  lockAvailable = true;
  killSwitch: string | null = null;
  async set(): Promise<string | null> { return this.lockAvailable ? 'OK' : null; }
  async get(): Promise<string | null> { return this.killSwitch; }
  async eval(): Promise<number> { return 1; }
}

function payload(): EditorialVerificationJobData {
  return prepareEditorialVerificationJob({
    draftId: 'draft-1', revisionId: 'revision-1', expectedContentHash: 'hash-1',
    trigger: 'ADMIN', requestedAt: new Date('2026-07-18T12:00:00Z'),
  });
}

function job(overrides: Partial<Job<EditorialVerificationJobData>> = {}): Job<EditorialVerificationJobData> {
  const data = payload();
  return {
    id: buildEditorialVerificationJobId(data), data, attemptsMade: 0, opts: { attempts: 4 }, token: 'token',
    moveToDelayed: vi.fn(async () => undefined), ...overrides,
  } as Job<EditorialVerificationJobData>;
}

function flags(overrides: NodeJS.ProcessEnv = {}) {
  return resolveEditorialVerificationRuntimeFlags({
    EDITORIAL_VERIFICATION_WORKER_ENABLED: 'true',
    EDITORIAL_VERIFICATION_KILL_SWITCH: 'false',
    ...overrides,
  });
}

function client(): PrismaClient {
  return {
    editorialDraft: {
      findUnique: vi.fn().mockResolvedValue({
        contentHash: 'hash-1', currentRevisionId: 'revision-1', article: { status: 'DRAFT' },
      }),
    },
  } as unknown as PrismaClient;
}

function budget(consume = vi.fn().mockResolvedValue(undefined)): EditorialVerificationBudgetService {
  return { consume } as unknown as EditorialVerificationBudgetService;
}

describe('private editorial verification worker', () => {
  it('is not imported by the API or the active worker bootstrap', () => {
    const server = fs.readFileSync(path.resolve('src/server.ts'), 'utf8');
    const workerBootstrap = fs.readFileSync(path.resolve('src/workers/index.ts'), 'utf8');
    expect(server).not.toContain('editorial-verification.worker');
    expect(workerBootstrap).not.toContain('editorial-verification.worker');
  });

  it('delays work behind both configuration and Redis kill switches', async () => {
    const killed = createEditorialVerificationProcessor({
      client: client(), redis: new WorkerRedis(), flags: flags({ EDITORIAL_VERIFICATION_KILL_SWITCH: 'true' }),
      metrics: new EditorialVerificationMetrics(), budget: budget(), documentQueue: { add: vi.fn() },
    });
    await expect(killed(job(), 'token')).rejects.toBeInstanceOf(DelayedError);
    const redis = new WorkerRedis(); redis.killSwitch = 'on';
    const remotelyKilled = createEditorialVerificationProcessor({
      client: client(), redis, flags: flags(), metrics: new EditorialVerificationMetrics(),
      budget: budget(), documentQueue: { add: vi.fn() },
    });
    await expect(remotelyKilled(job(), 'token')).rejects.toBeInstanceOf(DelayedError);
  });

  it('rejects tampered or superseded jobs before any external call', async () => {
    const consume = vi.fn();
    const processor = createEditorialVerificationProcessor({
      client: client(), redis: new WorkerRedis(), flags: flags(), metrics: new EditorialVerificationMetrics(),
      budget: budget(consume), documentQueue: { add: vi.fn() },
    });
    await expect(processor(job({ id: 'tampered' }), 'token')).rejects.toBeInstanceOf(UnrecoverableError);
    expect(consume).not.toHaveBeenCalled();
  });

  it.each(['SERPER', 'MISTRAL', 'OPENAI'] as const)('turns transient %s failures into retryable failures', async (dependency) => {
    const verifyDraft = vi.fn(async (_client, _input, adapters) => {
      if (dependency === 'SERPER') await adapters.serperSearcher?.('actualité test');
      if (dependency === 'MISTRAL') await adapters.mistralAuditor?.audit({} as never);
      if (dependency === 'OPENAI') await adapters.sourceHydrator?.hydrate({} as never, 0);
      throw new Error('unreachable');
    });
    const processor = createEditorialVerificationProcessor({
      client: client(), redis: new WorkerRedis(), flags: flags(), metrics: new EditorialVerificationMetrics(),
      budget: budget(), documentQueue: { add: vi.fn() }, verifyDraft: verifyDraft as never,
      serperSearcher: vi.fn().mockRejectedValue(new Error('Serper unavailable')),
      mistralAuditor: {
        model: 'test', audit: vi.fn().mockResolvedValue({ outcome: 'HUMAN_REVIEW_REQUIRED', reasons: ['MISTRAL_UNAVAILABLE'] }),
      } as never,
      sourceHydrator: { hydrate: vi.fn().mockRejectedValue(new Error('TrustScore unavailable')) },
    });
    await expect(processor(job(), 'token')).rejects.toMatchObject({
      name: 'RetryableEditorialVerificationDependencyError', dependency,
    });
  });

  it('delays until the next UTC budget window instead of bypassing quotas', async () => {
    const now = new Date('2026-07-18T23:59:00Z');
    const processor = createEditorialVerificationProcessor({
      client: client(), redis: new WorkerRedis(), flags: flags(), metrics: new EditorialVerificationMetrics(),
      budget: budget(vi.fn().mockRejectedValue(new EditorialVerificationBudgetExceededError('VERIFICATION', now))),
      documentQueue: { add: vi.fn() }, now: () => now,
    });
    const queued = job();
    await expect(processor(queued, 'token')).rejects.toBeInstanceOf(DelayedError);
    expect(queued.moveToDelayed).toHaveBeenCalledOnce();
  });

  it('persists only a shadow decision while the Article remains DRAFT', async () => {
    const update = vi.fn().mockResolvedValue({});
    const workerClient = {
      editorialDraft: {
        findUnique: vi.fn().mockResolvedValue({
          contentHash: 'hash-1', currentRevisionId: 'revision-1', article: { status: 'DRAFT' },
        }),
      },
      editorialVerificationRun: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ serperDocumentIds: [] })
          .mockResolvedValueOnce({
            id: 'run-1', status: 'PASSED', gateReasons: [], sourceSnapshot: [{}, {}, {}],
            mistralAudit: { outcome: 'PASSED', contradictions: [] },
            corpusAssessment: { final: { independentDomains: 3 } },
            article: { status: 'DRAFT', factCheckScore: 91 },
            draft: {
              qualityGate: { qualityScore: 92, publishabilityScore: 90 },
              brief: { dossier: { candidate: {
                riskLevel: 'LOW', topic: { dominantCategoryId: null, label: 'Mission spatiale européenne' },
              } } },
            },
          }),
        update,
      },
      ingestedDocument: { findMany: vi.fn().mockResolvedValue([]) },
      category: { findUnique: vi.fn() },
      article: { update: vi.fn(), updateMany: vi.fn() },
    } as unknown as PrismaClient;
    const verifyDraft = vi.fn().mockResolvedValue({
      runId: 'run-1', draftId: 'draft-1', revisionId: 'revision-1', articleId: 'article-1',
      outcome: 'FINALIZED', serperRequired: false, serperDocuments: 0, mistralReasons: [], factCheckScore: 91,
    });
    const metrics = new EditorialVerificationMetrics();
    const processor = createEditorialVerificationProcessor({
      client: workerClient, redis: new WorkerRedis(), flags: flags(), metrics, budget: budget(),
      documentQueue: { add: vi.fn() }, verifyDraft,
    });
    await expect(processor(job(), 'token')).resolves.toMatchObject({
      shadow: { decision: 'WOULD_AUTO_PUBLISH' },
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ shadowDecision: 'WOULD_AUTO_PUBLISH' }),
    }));
    expect((workerClient.article.update as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((workerClient.article.updateMany as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(metrics.snapshot()).toMatchObject({ jobsSucceeded: 1, shadowDecisions: { WOULD_AUTO_PUBLISH: 1 } });
  });

  it('calls the isolated auto-publisher only when its explicit flag is enabled', async () => {
    const update = vi.fn().mockResolvedValue({});
    const workerClient = {
      editorialDraft: { findUnique: vi.fn().mockResolvedValue({ contentHash: 'hash-1', currentRevisionId: 'revision-1', article: { status: 'DRAFT' } }) },
      editorialVerificationRun: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ serperDocumentIds: [] })
          .mockResolvedValueOnce({
            id: 'run-1', status: 'PASSED', gateReasons: [], sourceSnapshot: [{}, {}, {}], mistralAudit: { outcome: 'PASSED', contradictions: [] },
            corpusAssessment: { final: { independentDomains: 3 } }, article: { status: 'DRAFT', factCheckScore: 91 },
            draft: { qualityGate: { qualityScore: 92, publishabilityScore: 90 }, brief: { dossier: { candidate: { riskLevel: 'LOW', topic: { dominantCategoryId: null, label: 'Mission spatiale' } } } } },
          }),
        update,
      },
      ingestedDocument: { findMany: vi.fn().mockResolvedValue([]) }, category: { findUnique: vi.fn() }, article: { update: vi.fn(), updateMany: vi.fn() },
    } as unknown as PrismaClient;
    const autoPublish = vi.fn().mockResolvedValue({ outcome: 'ARTICLE_PUBLISHED', articleId: 'article-1' });
    const processor = createEditorialVerificationProcessor({
      client: workerClient, redis: new WorkerRedis(), flags: flags({ EDITORIAL_AUTOPUBLISH_ENABLED: 'true', EDITORIAL_AUTOPUBLISH_KILL_SWITCH: 'false', EDITORIAL_AUTOPUBLISH_SYSTEM_USER_ID: 'system-admin' }),
      metrics: new EditorialVerificationMetrics(), budget: budget(), documentQueue: { add: vi.fn() }, autoPublish,
      verifyDraft: vi.fn().mockResolvedValue({ runId: 'run-1', draftId: 'draft-1', revisionId: 'revision-1', articleId: 'article-1', outcome: 'FINALIZED', serperRequired: false, serperDocuments: 0, mistralReasons: [], factCheckScore: 91 }),
    });
    await expect(processor(job(), 'token')).resolves.toMatchObject({ autoPublication: { outcome: 'ARTICLE_PUBLISHED' } });
    expect(autoPublish).toHaveBeenCalledWith(workerClient, expect.objectContaining({ verificationRunId: 'run-1', draftId: 'draft-1' }));
  });

  it('dead-letters only terminal failures with bounded diagnostics', () => {
    const queued = job({ attemptsMade: 4 });
    expect(isTerminalEditorialVerificationFailure(queued, new Error('retry exhausted'))).toBe(true);
    expect(isTerminalEditorialVerificationFailure(job({ attemptsMade: 1 }), new Error('retry me'))).toBe(false);
    const dlq = buildEditorialVerificationDeadLetterData(queued, new Error('x'.repeat(2_000)), new Date('2026-07-18T12:00:00Z'));
    expect(dlq.error).toHaveLength(1_000);
    expect(dlq.failedAt).toBe('2026-07-18T12:00:00.000Z');
  });
});
