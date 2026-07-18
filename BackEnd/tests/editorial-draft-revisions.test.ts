import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  authorizeEditorialPublication,
  createEditorialDraftCorrection,
  recalculateEditorialRevisionGate,
} from '../src/lib/editorial-draft/revision-service.js';
import { hashEditorialDraftArtifact, renderEditorialDraftHtml } from '../src/lib/editorial-draft/draft-service.js';
import type { EditorialClaimCritic } from '../src/lib/editorial-draft/types.js';
import { draftEvidence, validArtifact } from './fixtures/editorial/draft.js';

const originalHash = hashEditorialDraftArtifact(validArtifact);
const correctedArtifact = { ...validArtifact, title: `${validArtifact.title} - correction` };
const correctedHash = hashEditorialDraftArtifact(correctedArtifact);

function frozenEvidence() {
  return draftEvidence.map((item, index) => ({ id: `brief-evidence-${index + 1}`, ...item }));
}

function correctionSource() {
  return {
    id: 'draft-1',
    status: 'ARTICLE_DRAFT_CREATED',
    articleId: 'article-1',
    article: { id: 'article-1', status: 'DRAFT' },
    contentHash: originalHash,
    configuration: null,
    currentRevision: { id: 'revision-1', version: 1, status: 'APPROVED', contentHash: originalHash },
    qualityGate: { id: 'gate-1' },
    reviewDecisions: [{ id: 'decision-1' }],
    publicationAuthorizations: [{ id: 'authorization-1' }],
    brief: { dossier: { evidence: frozenEvidence() } },
  };
}

describe('versioned editorial corrections', () => {
  it('creates an immutable next revision and invalidates every previous decision and gate', async () => {
    const transaction = {
      article: { updateMany: vi.fn(async () => ({ count: 1 })) },
      editorialReviewDecision: { updateMany: vi.fn(async () => ({ count: 1 })) },
      editorialPublicationAuthorization: { updateMany: vi.fn(async () => ({ count: 1 })) },
      editorialDraftRevision: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        create: vi.fn(async () => ({})),
      },
      editorialQualityGate: { deleteMany: vi.fn(async () => ({ count: 1 })) },
      editorialDraftClaim: { deleteMany: vi.fn(async () => ({ count: 2 })) },
      articleSource: { deleteMany: vi.fn(async () => ({ count: 2 })) },
      editorialDraft: { updateMany: vi.fn(async () => ({ count: 1 })) },
      editorialReviewAuditLog: { create: vi.fn(async () => ({})) },
    };
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-corrector', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => correctionSource()) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;

    const result = await createEditorialDraftCorrection(client, {
      draftId: 'draft-1',
      correctedByUserId: 'admin-corrector',
      expectedContentHash: originalHash,
      correctionNote: 'Correction factuelle documentée par la rédaction.',
      artifact: correctedArtifact,
    });

    expect(result).toMatchObject({ version: 2, contentHash: correctedHash, status: 'REVISION_PENDING_GATE', invalidatedDecisions: 1, invalidatedAuthorizations: 1 });
    expect(transaction.editorialDraftRevision.create.mock.calls[0][0].data).toMatchObject({
      parentRevisionId: 'revision-1', origin: 'ADMIN_CORRECTION', status: 'PENDING_CRITIC', correctedById: 'admin-corrector',
    });
    expect(transaction.editorialQualityGate.deleteMany).toHaveBeenCalledOnce();
    expect(transaction.editorialDraftClaim.deleteMany).toHaveBeenCalledOnce();
    expect(transaction.articleSource.deleteMany).toHaveBeenCalledWith({ where: { articleId: 'article-1' } });
    expect(transaction.editorialDraft.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'REVISION_PENDING_GATE', contentHash: correctedHash });
    expect(transaction.editorialReviewAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'DECISIONS_INVALIDATED' }) }));
  });

  it('requires a changed artifact and the exact current hash', async () => {
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-corrector', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => correctionSource()) },
    } as unknown as PrismaClient;
    const base = {
      draftId: 'draft-1', correctedByUserId: 'admin-corrector', correctionNote: 'Correction factuelle documentée.', artifact: validArtifact,
    };
    await expect(createEditorialDraftCorrection(client, { ...base, expectedContentHash: 'stale' })).rejects.toMatchObject({ code: 'EDITORIAL_DRAFT_HASH_MISMATCH' });
    await expect(createEditorialDraftCorrection(client, { ...base, expectedContentHash: originalHash })).rejects.toMatchObject({ code: 'EDITORIAL_CORRECTION_UNCHANGED' });
  });

  it('cannot correct an Article that is published or wins a concurrent publication race', async () => {
    const input = {
      draftId: 'draft-1', correctedByUserId: 'admin-corrector', expectedContentHash: originalHash,
      correctionNote: 'Correction factuelle documentée par la rédaction.', artifact: correctedArtifact,
    };
    const publishedClient = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-corrector', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => ({ ...correctionSource(), article: { id: 'article-1', status: 'PUBLISHED' } })) },
    } as unknown as PrismaClient;
    await expect(createEditorialDraftCorrection(publishedClient, input)).rejects.toMatchObject({ code: 'EDITORIAL_PUBLISHED_ARTICLE_IMMUTABLE' });

    const transaction = {
      article: { updateMany: vi.fn(async () => ({ count: 0 })) },
      editorialReviewDecision: { updateMany: vi.fn() },
    };
    const concurrentClient = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-corrector', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => correctionSource()) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;
    await expect(createEditorialDraftCorrection(concurrentClient, input)).rejects.toMatchObject({ code: 'EDITORIAL_PUBLICATION_CONFLICT' });
    expect(transaction.editorialReviewDecision.updateMany).not.toHaveBeenCalled();
  });
});

describe('mandatory factual recheck after correction', () => {
  it('runs a new claim critic before recreating a gate for the current revision', async () => {
    const reviews = correctedArtifact.claims.map((claim) => ({
      claimKey: claim.claimKey,
      verdict: 'SUPPORTED' as const,
      explanation: 'Directly supported by the frozen evidence.',
      evidenceKeys: claim.evidenceKeys,
    }));
    const critic: EditorialClaimCritic = {
      model: 'critic-revision-test',
      review: vi.fn(async () => ({ reviews, inputTokens: 10, outputTokens: 5, estimatedCostMicros: 1 })),
    };
    const transaction = {
      editorialDraftRevision: { updateMany: vi.fn(async () => ({ count: 1 })) },
      editorialDraftClaim: { deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
      editorialDraftClaimEvidence: { createMany: vi.fn(async () => ({})) },
      editorialQualityGate: { create: vi.fn(async () => ({})) },
      editorialDraft: { update: vi.fn(async () => ({})) },
      editorialReviewAuditLog: { create: vi.fn(async () => ({})) },
    };
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-reviewer', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => ({
        id: 'draft-1', status: 'REVISION_PENDING_GATE', articleId: 'article-1', contentHash: correctedHash, configuration: null, metrics: null,
        currentRevision: {
          id: 'revision-2', version: 2, status: 'PENDING_CRITIC', contentHash: correctedHash,
          structuredContent: correctedArtifact, contentHtml: renderEditorialDraftHtml(correctedArtifact),
        },
        qualityGate: null,
        brief: { dossier: { candidate: { riskLevel: 'MEDIUM' }, evidence: frozenEvidence() } },
      })) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;

    const result = await recalculateEditorialRevisionGate(client, {
      draftId: 'draft-1', revisionId: 'revision-2', reviewedByUserId: 'admin-reviewer', expectedContentHash: correctedHash,
      reviewNote: 'Nouvelle passe critique sur toutes les affirmations.', critic,
    });

    expect(critic.review).toHaveBeenCalledOnce();
    expect(result.outcome).toBe('READY_FOR_REVIEW');
    expect(transaction.editorialQualityGate.create.mock.calls[0][0].data).toMatchObject({ humanReviewStatus: 'PENDING', evaluatedContentHash: correctedHash });
    expect(transaction.editorialDraftRevision.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'GATE_PASSED', criticModel: 'critic-revision-test' });
    expect(transaction.editorialReviewAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'GATE_RECALCULATED' }) }));
  });
});

function authorizationSource(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    status: 'ARTICLE_DRAFT_CREATED',
    articleId: 'article-1',
    contentHash: correctedHash,
    currentRevision: {
      id: 'revision-2', version: 2, status: 'APPROVED', contentHash: correctedHash, correctedById: 'admin-corrector',
      reviewDecisions: [{ id: 'decision-1', adminUserId: 'admin-approver', contentHash: correctedHash }],
      publicationAuthorizations: [],
    },
    qualityGate: { humanReviewStatus: 'APPROVED', evaluatedContentHash: correctedHash },
    article: { id: 'article-1', status: 'DRAFT', structuredContent: { contentHash: correctedHash } },
    ...overrides,
  };
}

describe('four-eyes publication authorization', () => {
  it('blocks the draft approver and the correcting admin from acting as second reviewer', async () => {
    const clientFor = (id: string) => ({
      user: { findUnique: vi.fn(async () => ({ id, role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => authorizationSource()) },
    }) as unknown as PrismaClient;
    const base = {
      draftId: 'draft-1', revisionId: 'revision-2', expectedContentHash: correctedHash,
      authorizationNote: 'Autorisation manuelle après revue indépendante.',
    };
    await expect(authorizeEditorialPublication(clientFor('admin-approver'), { ...base, authorizedByUserId: 'admin-approver' }))
      .rejects.toMatchObject({ code: 'EDITORIAL_FOUR_EYES_REQUIRED' });
    await expect(authorizeEditorialPublication(clientFor('admin-corrector'), { ...base, authorizedByUserId: 'admin-corrector' }))
      .rejects.toMatchObject({ code: 'EDITORIAL_CORRECTOR_CANNOT_SECOND_REVIEW' });
  });

  it('records a distinct manual authorization without publishing the Article', async () => {
    const transaction = {
      editorialPublicationAuthorization: { create: vi.fn(async () => ({ id: 'authorization-2' })) },
      editorialReviewAuditLog: { create: vi.fn(async () => ({})) },
      article: { update: vi.fn() },
    };
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-second', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => authorizationSource()) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;
    const result = await authorizeEditorialPublication(client, {
      draftId: 'draft-1', revisionId: 'revision-2', authorizedByUserId: 'admin-second', expectedContentHash: correctedHash,
      authorizationNote: 'Autorisation manuelle après revue indépendante.',
    });
    expect(result).toMatchObject({ outcome: 'PUBLICATION_AUTHORIZED', articleStatus: 'DRAFT' });
    expect(transaction.editorialPublicationAuthorization.create.mock.calls[0][0].data).toMatchObject({
      draftApproverId: 'admin-approver', authorizedById: 'admin-second', decisionType: 'AUTHORIZE_PUBLICATION', status: 'AUTHORIZED',
    });
    expect(transaction.editorialPublicationAuthorization.create.mock.calls[0][0].data.expiresAt).toBeInstanceOf(Date);
    expect(transaction.article.update).not.toHaveBeenCalled();
    expect(transaction.editorialReviewAuditLog.create.mock.calls[0][0].data.details).toMatchObject({ decision: 'AUTHORIZE_PUBLICATION', articleStatusUnchanged: true });
  });
});
