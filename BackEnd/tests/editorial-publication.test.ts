import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  publishEditorialArticle,
  revokeEditorialPublicationAuthorization,
} from '../src/lib/editorial-draft/publication-service.js';

const now = new Date('2026-07-19T12:00:00.000Z');
const contentHash = 'a'.repeat(64);

function publicationState(overrides: Record<string, unknown> = {}) {
  const authorization = {
    id: 'authorization-1',
    draftId: 'draft-1',
    revisionId: 'revision-2',
    articleId: 'article-1',
    draftApproverId: 'admin-approver',
    authorizedById: 'admin-authorizer',
    contentHash,
    status: 'AUTHORIZED',
    authorizedAt: new Date('2026-07-19T10:00:00.000Z'),
    expiresAt: new Date('2026-07-20T10:00:00.000Z'),
    consumedAt: null,
    revokedAt: null,
    revokedById: null,
    revocationReason: null,
    invalidatedAt: null,
    invalidationReason: null,
  };
  return {
    id: 'draft-1',
    status: 'ARTICLE_DRAFT_CREATED',
    articleId: 'article-1',
    contentHash,
    currentRevision: {
      id: 'revision-2',
      status: 'APPROVED',
      contentHash,
      reviewDecisions: [{ adminUserId: 'admin-approver', contentHash }],
      publicationAuthorizations: [authorization],
    },
    qualityGate: {
      gateVersion: 'quality-gate-v2',
      automatedDecision: 'PASSED',
      humanReviewStatus: 'APPROVED',
      evaluatedContentHash: contentHash,
      qualityScore: 94,
      publishabilityScore: 91,
    },
    article: {
      id: 'article-1',
      status: 'DRAFT',
      publishedAt: null,
      structuredContent: {
        origin: 'EPION_AUTOMATIC_EDITORIAL',
        editorialDraftId: 'draft-1',
        editorialRevisionId: 'revision-2',
        contentHash,
      },
      articleSources: [
        { id: 'article-source-1', sourceId: 'source-1', sourceUrlHash: 'url-hash-1', provenance: 'EDITORIAL', source: { id: 'source-1', domain: 'one.example' } },
        { id: 'article-source-2', sourceId: 'source-2', sourceUrlHash: 'url-hash-2', provenance: 'EDITORIAL', source: { id: 'source-2', domain: 'two.example' } },
      ],
    },
    ...overrides,
  };
}

function publishInput() {
  return {
    draftId: 'draft-1',
    revisionId: 'revision-2',
    publishedByUserId: 'admin-publisher',
    expectedContentHash: contentHash,
    publicationNote: 'Publication manuelle après vérification finale complète.',
    now,
  };
}

describe('manual transactional editorial publication', () => {
  it('publishes only the Article and consumes the four-eyes authorization atomically', async () => {
    const transaction = {
      article: { updateMany: vi.fn(async () => ({ count: 1 })) },
      articleSource: { findMany: vi.fn(async () => [
        { id: 'article-source-1', sourceId: 'source-1', sourceUrlHash: 'url-hash-1', provenance: 'EDITORIAL' },
        { id: 'article-source-2', sourceId: 'source-2', sourceUrlHash: 'url-hash-2', provenance: 'EDITORIAL' },
      ]) },
      editorialPublicationAuthorization: { updateMany: vi.fn(async () => ({ count: 1 })) },
      editorialReviewAuditLog: { create: vi.fn(async () => ({})) },
    };
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-publisher', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => publicationState()) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;

    const result = await publishEditorialArticle(client, publishInput());

    expect(result).toEqual({
      draftId: 'draft-1', revisionId: 'revision-2', articleId: 'article-1', authorizationId: 'authorization-1',
      outcome: 'ARTICLE_PUBLISHED', articleStatus: 'PUBLISHED', publishedAt: now,
    });
    expect(transaction.article.updateMany).toHaveBeenCalledWith({
      where: { id: 'article-1', status: 'DRAFT' },
      data: { status: 'PUBLISHED', publishedAt: now },
    });
    expect(transaction.editorialPublicationAuthorization.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'authorization-1', status: 'AUTHORIZED', contentHash },
      data: { status: 'CONSUMED', consumedAt: now },
    });
    expect(transaction.editorialReviewAuditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'ARTICLE_PUBLISHED', actorUserId: 'admin-publisher', articleId: 'article-1',
      details: { manualActionRequired: true, automaticPublicationAllowed: false, materializedSources: 2 },
    });
  });

  it('returns the existing result when the same valid state is already published', async () => {
    const publishedAt = new Date('2026-07-19T11:00:00.000Z');
    const state = publicationState() as any;
    state.article.status = 'PUBLISHED';
    state.article.publishedAt = publishedAt;
    state.currentRevision.publicationAuthorizations[0].status = 'CONSUMED';
    state.currentRevision.publicationAuthorizations[0].consumedAt = publishedAt;
    const transaction = vi.fn();
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-publisher', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => state) },
      $transaction: transaction,
    } as unknown as PrismaClient;

    await expect(publishEditorialArticle(client, publishInput())).resolves.toMatchObject({
      outcome: 'ALREADY_PUBLISHED', articleStatus: 'PUBLISHED', publishedAt,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('resolves two concurrent manual publications idempotently', async () => {
    const transaction = {
      article: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        findUnique: vi.fn(async () => ({ status: 'PUBLISHED', publishedAt: now })),
      },
      editorialPublicationAuthorization: {
        findUnique: vi.fn(async () => ({ status: 'CONSUMED', contentHash })),
        updateMany: vi.fn(),
      },
      articleSource: { findMany: vi.fn() },
      editorialReviewAuditLog: { create: vi.fn() },
    };
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-publisher', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => publicationState()) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;

    await expect(publishEditorialArticle(client, publishInput())).resolves.toMatchObject({ outcome: 'ALREADY_PUBLISHED' });
    expect(transaction.editorialPublicationAuthorization.updateMany).not.toHaveBeenCalled();
    expect(transaction.editorialReviewAuditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ['missing sources', { article: { ...publicationState().article, articleSources: [] } }, 'EDITORIAL_ARTICLE_SOURCES_MISSING'],
    ['stale article identity', { article: { ...publicationState().article, structuredContent: { contentHash } } }, 'EDITORIAL_ARTICLE_DRAFT_STALE'],
    ['failed gate', { qualityGate: { ...publicationState().qualityGate, automatedDecision: 'FAILED' } }, 'EDITORIAL_PUBLICATION_GATE_INVALID'],
    ['archived article', { article: { ...publicationState().article, status: 'ARCHIVED' } }, 'EDITORIAL_ARTICLE_STATUS_INCOMPATIBLE'],
  ])('blocks publication with %s', async (_label, overrides, expectedCode) => {
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-publisher', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => publicationState(overrides)) },
    } as unknown as PrismaClient;
    await expect(publishEditorialArticle(client, publishInput())).rejects.toMatchObject({ code: expectedCode });
  });

  it('expires an outdated authorization and audits it without publishing', async () => {
    const state = publicationState() as any;
    state.currentRevision.publicationAuthorizations[0].expiresAt = new Date('2026-07-19T11:00:00.000Z');
    const transaction = {
      editorialPublicationAuthorization: { updateMany: vi.fn(async () => ({ count: 1 })) },
      editorialReviewAuditLog: { create: vi.fn(async () => ({})) },
      article: { updateMany: vi.fn() },
    };
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-publisher', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => state) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;

    await expect(publishEditorialArticle(client, publishInput())).rejects.toMatchObject({ code: 'EDITORIAL_PUBLICATION_AUTHORIZATION_EXPIRED' });
    expect(transaction.editorialPublicationAuthorization.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'EXPIRED' } }));
    expect(transaction.editorialReviewAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'PUBLICATION_EXPIRED' }) }));
    expect(transaction.article.updateMany).not.toHaveBeenCalled();
  });
});

describe('publication authorization revocation', () => {
  it('revokes an unused authorization and leaves the Article DRAFT unchanged', async () => {
    const transaction = {
      editorialPublicationAuthorization: { updateMany: vi.fn(async () => ({ count: 1 })), findUnique: vi.fn() },
      editorialReviewAuditLog: { create: vi.fn(async () => ({})) },
      article: { updateMany: vi.fn() },
    };
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-revoker', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => publicationState()) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;

    const result = await revokeEditorialPublicationAuthorization(client, {
      draftId: 'draft-1', revisionId: 'revision-2', revokedByUserId: 'admin-revoker', expectedContentHash: contentHash,
      revocationNote: 'Autorisation retirée après nouvelle information éditoriale.', now,
    });
    expect(result.outcome).toBe('PUBLICATION_AUTHORIZATION_REVOKED');
    expect(transaction.editorialPublicationAuthorization.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'REVOKED', revokedAt: now, revokedById: 'admin-revoker',
    });
    expect(transaction.article.updateMany).not.toHaveBeenCalled();
    expect(transaction.editorialReviewAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'PUBLICATION_REVOKED' }) }));
  });
});
