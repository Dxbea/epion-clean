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
});
