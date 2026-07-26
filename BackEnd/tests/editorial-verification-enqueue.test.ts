import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { materializeQualityGateArticleDraft } = vi.hoisted(() => ({
  materializeQualityGateArticleDraft: vi.fn(),
}));

vi.mock('../src/lib/editorial-draft/quality-gate-materializer.js', () => ({
  materializeQualityGateArticleDraft,
}));

import { enqueueEditorialVerificationForDraft } from '../src/lib/editorial-verification/enqueue-service.js';

const previousMode = process.env.EDITORIAL_VALIDATION_MODE;

afterEach(() => {
  materializeQualityGateArticleDraft.mockReset();
  if (previousMode === undefined) delete process.env.EDITORIAL_VALIDATION_MODE;
  else process.env.EDITORIAL_VALIDATION_MODE = previousMode;
});

function clientFixture() {
  return {
    editorialDraft: {
      findUnique: vi.fn(async () => ({
        id: 'draft-1',
        contentHash: 'hash-1',
        currentRevisionId: 'revision-1',
        currentRevision: { id: 'revision-1', status: 'GATE_PASSED', contentHash: 'hash-1' },
        qualityGate: { automatedDecision: 'PASSED', humanReviewStatus: 'PENDING' },
        article: { id: 'article-1', status: 'DRAFT' },
      })),
    },
    editorialVerificationRun: {
      findMany: vi.fn(async () => [{ id: 'old-run-v1' }]),
    },
    articleSource: {
      count: vi.fn(async () => 2),
    },
  } as unknown as PrismaClient;
}

describe('editorial verification enqueue transition', () => {
  it('materializes an Article DRAFT and enqueues without human approval in quality_gate mode', async () => {
    process.env.EDITORIAL_VALIDATION_MODE = 'quality_gate';
    const queue = { add: vi.fn(async () => ({})) };

    await expect(enqueueEditorialVerificationForDraft(clientFixture(), {
      draftId: 'draft-1', expectedContentHash: 'hash-1',
    }, { queue })).resolves.toMatchObject({
      draftId: 'draft-1', articleId: 'article-1', outcome: 'VERIFICATION_QUEUED',
    });
    expect(materializeQualityGateArticleDraft).toHaveBeenCalledWith(expect.anything(), 'draft-1');
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('keeps the human-review gate when the mode is absent', async () => {
    delete process.env.EDITORIAL_VALIDATION_MODE;
    await expect(enqueueEditorialVerificationForDraft(clientFixture(), {
      draftId: 'draft-1', expectedContentHash: 'hash-1',
    }, { queue: { add: vi.fn(async () => ({})) } })).rejects.toThrow('automated and human approval gates');
    expect(materializeQualityGateArticleDraft).not.toHaveBeenCalled();
  });

  it('creates a distinct controlled retry job after an old terminal run', async () => {
    process.env.EDITORIAL_VALIDATION_MODE = 'quality_gate';
    const queue = { add: vi.fn(async (_name: string, data: any, options: { jobId: string }) => ({ id: options.jobId, data })) };

    const result = await enqueueEditorialVerificationForDraft(clientFixture(), {
      draftId: 'draft-1', expectedContentHash: 'hash-1',
    }, { queue, retryReason: 'ARTICLE_SOURCES_INCOMPLETE' });

    expect(result).toMatchObject({ outcome: 'VERIFICATION_QUEUED', retryReason: 'ARTICLE_SOURCES_INCOMPLETE' });
    expect(queue.add).toHaveBeenCalledWith('verify-editorial-draft', expect.objectContaining({
      mistralPromptVersion: 'editorial-mistral-audit-v3',
      retryReason: 'ARTICLE_SOURCES_INCOMPLETE',
      retryAttempt: 1,
    }), expect.objectContaining({ jobId: expect.not.stringContaining('eb337473572061ea2245675d37495df6') }));
  });

  it('refuses to report queued when ArticleSource repair remains empty', async () => {
    process.env.EDITORIAL_VALIDATION_MODE = 'quality_gate';
    const client = clientFixture() as any;
    client.articleSource.count.mockResolvedValue(0);
    const queue = { add: vi.fn(async () => ({})) };

    await expect(enqueueEditorialVerificationForDraft(client, {
      draftId: 'draft-1', expectedContentHash: 'hash-1',
    }, { queue, retryReason: 'ARTICLE_SOURCES_INCOMPLETE' })).rejects.toThrow('ArticleSource repair did not materialize');
    expect(queue.add).not.toHaveBeenCalled();
  });
});
