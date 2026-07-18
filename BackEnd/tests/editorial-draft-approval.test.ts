import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { reviewControlledEditorialDraft } from '../src/lib/editorial-draft/approval-service.js';
import { hashEditorialDraftArtifact, renderEditorialDraftHtml } from '../src/lib/editorial-draft/draft-service.js';
import { validArtifact } from './fixtures/editorial/draft.js';

const VALID_CONTENT_HASH = hashEditorialDraftArtifact(validArtifact);

function proof(index: 1 | 2) {
  const domain = index === 1 ? 'one.example' : 'two.example';
  return {
    criticConfirmed: true,
    citationOrder: index - 1,
    briefEvidence: {
      evidenceKey: `ev_${index === 1 ? 'one' : 'two'}`,
      canonicalUrl: `https://${domain}/article`,
      domain,
      role: 'PRIMARY',
      position: index - 1,
      documentTitle: `Document ${index}`,
      document: {
        source: {
          id: `source-${index}`,
          domain,
          profileData: null,
          profileConfidence: null,
          publicTrustLabel: null,
          lastProfiledAt: null,
          profileVersion: null,
        },
      },
    },
  };
}

function reviewableDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1', briefId: 'brief-1', articleId: null, status: 'READY_FOR_REVIEW',
    contentHash: VALID_CONTENT_HASH, title: validArtifact.title, summary: validArtifact.summary,
    contentHtml: renderEditorialDraftHtml(validArtifact), structuredContent: validArtifact,
    generatedAt: new Date('2026-07-18T12:00:00Z'),
    qualityGate: { id: 'gate-1', gateVersion: 'quality-gate-v2', automatedDecision: 'PASSED', humanReviewStatus: 'PENDING', evaluatedContentHash: VALID_CONTENT_HASH },
    brief: { dossier: { candidate: { topic: { dominantCategoryId: null } } } },
    claims: [
      { claimKey: 'claim_1', verdict: 'SUPPORTED', evidence: [proof(1), proof(2)] },
      { claimKey: 'claim_2', verdict: 'SUPPORTED', evidence: [proof(2)] },
    ],
    ...overrides,
  };
}

function input(decision: 'APPROVE' | 'REJECT' = 'APPROVE') {
  return { draftId: 'draft-1', reviewerUserId: 'admin-1', decision, reviewNote: 'Reviewed against the frozen evidence dossier.', expectedContentHash: VALID_CONTENT_HASH };
}

describe('mandatory human editorial gate', () => {
  it('creates exactly one Article DRAFT only after explicit ADMIN approval', async () => {
    const transaction = {
      editorialQualityGate: { updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(async () => ({})) },
      article: { create: vi.fn(async (args) => ({ id: 'article-1', args })) },
      articleSource: { upsert: vi.fn(async () => ({})) },
      editorialDraft: { update: vi.fn(async () => ({})) },
      editorialReviewAuditLog: { create: vi.fn(async () => ({})) },
    };
    const findUnique = vi.fn(async () => reviewableDraft());
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-1', role: 'ADMIN' })) },
      editorialDraft: { findUnique },
      category: { findUnique: vi.fn(async () => null) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;

    const result = await reviewControlledEditorialDraft(client, input());
    expect(result).toEqual({ draftId: 'draft-1', outcome: 'ARTICLE_DRAFT_CREATED', articleId: 'article-1' });
    const articleData = transaction.article.create.mock.calls[0][0].data;
    expect(articleData).toMatchObject({ status: 'DRAFT', authorId: null });
    expect(articleData.generationConfig).toMatchObject({ origin: 'EPION_AUTOMATIC_EDITORIAL', automaticPublicationAllowed: false, humanReviewerId: 'admin-1' });
    expect(transaction.editorialDraft.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'ARTICLE_DRAFT_CREATED', articleId: 'article-1' } }));
    expect(transaction.articleSource.upsert).toHaveBeenCalledTimes(2);
    expect(findUnique.mock.calls[0][0].include.claims.include.evidence.where).toEqual({ criticConfirmed: true });
    expect(transaction.articleSource.upsert.mock.calls.every(([args]) => args.create.provenance === 'EDITORIAL')).toBe(true);
    expect(transaction.editorialReviewAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'APPROVED', articleId: 'article-1' }) }));
  });

  it('never creates Article when the automated quality gate failed', async () => {
    const transaction = vi.fn();
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-1', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => reviewableDraft({ status: 'QUALITY_FAILED', qualityGate: { id: 'gate-1', gateVersion: 'quality-gate-v2', automatedDecision: 'FAILED', humanReviewStatus: 'PENDING', evaluatedContentHash: VALID_CONTENT_HASH } })) },
      editorialReviewAuditLog: { create: vi.fn(async () => ({})) },
      $transaction: transaction,
    } as unknown as PrismaClient;
    await expect(reviewControlledEditorialDraft(client, input())).rejects.toThrow('quality gate must pass');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('requires an ADMIN, a review note and the exact reviewed content hash', async () => {
    const userClient = { user: { findUnique: vi.fn(async () => ({ id: 'user-1', role: 'USER' })) } } as unknown as PrismaClient;
    await expect(reviewControlledEditorialDraft(userClient, { ...input(), reviewerUserId: 'user-1' })).rejects.toThrow('ADMIN');
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-1', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => reviewableDraft()) },
      editorialReviewAuditLog: { create: vi.fn(async () => ({})) },
    } as unknown as PrismaClient;
    await expect(reviewControlledEditorialDraft(client, { ...input(), expectedContentHash: 'stale-hash' })).rejects.toThrow('changed after');
    await expect(reviewControlledEditorialDraft(client, { ...input(), reviewNote: 'short' })).rejects.toThrow('review note');
  });

  it('blocks corrected drafts and records the invalidation in the audit log', async () => {
    const audit = vi.fn(async () => ({}));
    const transaction = vi.fn();
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-1', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => reviewableDraft({ title: 'Corrected after gate' })) },
      editorialReviewAuditLog: { create: audit },
      $transaction: transaction,
    } as unknown as PrismaClient;
    await expect(reviewControlledEditorialDraft(client, input())).rejects.toMatchObject({ code: 'EDITORIAL_DRAFT_INVALIDATED' });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'APPROVAL_BLOCKED' }) }));
    expect(transaction).not.toHaveBeenCalled();
  });

  it('blocks approval when a confirmed proof lacks a durable Source identity', async () => {
    const missingSource = reviewableDraft() as any;
    missingSource.claims[0].evidence[0].briefEvidence.document.source = null;
    const audit = vi.fn(async () => ({}));
    const transaction = vi.fn();
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-1', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => missingSource) },
      editorialReviewAuditLog: { create: audit },
      $transaction: transaction,
    } as unknown as PrismaClient;
    await expect(reviewControlledEditorialDraft(client, input())).rejects.toMatchObject({ code: 'EDITORIAL_SOURCE_IDENTITY_MISSING' });
    expect(audit).toHaveBeenCalledOnce();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('blocks approval under a stale quality-gate policy', async () => {
    const audit = vi.fn(async () => ({}));
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-1', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => reviewableDraft({ qualityGate: { id: 'gate-1', gateVersion: 'quality-gate-v1', automatedDecision: 'PASSED', humanReviewStatus: 'PENDING', evaluatedContentHash: VALID_CONTENT_HASH } })) },
      editorialReviewAuditLog: { create: audit },
    } as unknown as PrismaClient;
    await expect(reviewControlledEditorialDraft(client, input())).rejects.toMatchObject({ code: 'EDITORIAL_GATE_VERSION_STALE' });
    expect(audit).toHaveBeenCalledOnce();
  });

  it('is idempotent when an Article DRAFT already exists', async () => {
    const transaction = vi.fn();
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-1', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => reviewableDraft({ articleId: 'article-existing', status: 'ARTICLE_DRAFT_CREATED', qualityGate: { id: 'gate-1', gateVersion: 'quality-gate-v2', automatedDecision: 'PASSED', humanReviewStatus: 'APPROVED', evaluatedContentHash: VALID_CONTENT_HASH } })) },
      $transaction: transaction,
    } as unknown as PrismaClient;
    await expect(reviewControlledEditorialDraft(client, input())).resolves.toEqual({ draftId: 'draft-1', outcome: 'ALREADY_CREATED', articleId: 'article-existing' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('resolves a concurrent approval as an idempotent replay', async () => {
    const transaction = {
      editorialQualityGate: { updateMany: vi.fn(async () => ({ count: 0 })) },
      editorialDraft: { findUnique: vi.fn(async () => ({ articleId: 'article-concurrent' })) },
      article: { create: vi.fn() },
      articleSource: { upsert: vi.fn() },
    };
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-1', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => reviewableDraft()) },
      category: { findUnique: vi.fn(async () => null) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;
    await expect(reviewControlledEditorialDraft(client, input())).resolves.toEqual({ draftId: 'draft-1', outcome: 'ALREADY_CREATED', articleId: 'article-concurrent' });
    expect(transaction.article.create).not.toHaveBeenCalled();
  });

  it('records explicit human rejection without Article creation', async () => {
    const transaction = {
      editorialQualityGate: { updateMany: vi.fn(async () => ({ count: 1 })) },
      editorialDraft: { update: vi.fn(async () => ({})) },
      article: { create: vi.fn() },
      editorialReviewAuditLog: { create: vi.fn(async () => ({})) },
    };
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-1', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => reviewableDraft()) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;
    await expect(reviewControlledEditorialDraft(client, input('REJECT'))).resolves.toMatchObject({ outcome: 'REJECTED', articleId: null });
    expect(transaction.article.create).not.toHaveBeenCalled();
  });
});
