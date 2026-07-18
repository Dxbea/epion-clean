import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { reviewControlledEditorialDraft } from '../src/lib/editorial-draft/approval-service.js';

function reviewableDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1', briefId: 'brief-1', articleId: null, status: 'READY_FOR_REVIEW',
    contentHash: 'content-hash', title: 'Editorial title', summary: 'Editorial summary',
    contentHtml: '<section><h2>Facts</h2><p>Fact.</p></section>', structuredContent: { claims: [] },
    generatedAt: new Date('2026-07-18T12:00:00Z'),
    qualityGate: { id: 'gate-1', automatedDecision: 'PASSED', humanReviewStatus: 'PENDING' },
    brief: { dossier: { candidate: { topic: { dominantCategoryId: null } } } },
    ...overrides,
  };
}

function input(decision: 'APPROVE' | 'REJECT' = 'APPROVE') {
  return { draftId: 'draft-1', reviewerUserId: 'admin-1', decision, reviewNote: 'Reviewed against the frozen evidence dossier.', expectedContentHash: 'content-hash' };
}

describe('mandatory human editorial gate', () => {
  it('creates exactly one Article DRAFT only after explicit ADMIN approval', async () => {
    const transaction = {
      editorialQualityGate: { updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(async () => ({})) },
      article: { create: vi.fn(async (args) => ({ id: 'article-1', args })) },
      editorialDraft: { update: vi.fn(async () => ({})) },
    };
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-1', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => reviewableDraft()) },
      category: { findUnique: vi.fn(async () => null) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;

    const result = await reviewControlledEditorialDraft(client, input());
    expect(result).toEqual({ draftId: 'draft-1', outcome: 'ARTICLE_DRAFT_CREATED', articleId: 'article-1' });
    const articleData = transaction.article.create.mock.calls[0][0].data;
    expect(articleData).toMatchObject({ status: 'DRAFT', authorId: null });
    expect(articleData.generationConfig).toMatchObject({ origin: 'EPION_AUTOMATIC_EDITORIAL', automaticPublicationAllowed: false, humanReviewerId: 'admin-1' });
    expect(transaction.editorialDraft.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'ARTICLE_DRAFT_CREATED', articleId: 'article-1' } }));
  });

  it('never creates Article when the automated quality gate failed', async () => {
    const transaction = vi.fn();
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-1', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => reviewableDraft({ status: 'QUALITY_FAILED', qualityGate: { id: 'gate-1', automatedDecision: 'FAILED', humanReviewStatus: 'PENDING' } })) },
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
    } as unknown as PrismaClient;
    await expect(reviewControlledEditorialDraft(client, { ...input(), expectedContentHash: 'stale-hash' })).rejects.toThrow('changed after');
    await expect(reviewControlledEditorialDraft(client, { ...input(), reviewNote: 'short' })).rejects.toThrow('review note');
  });

  it('is idempotent when an Article DRAFT already exists', async () => {
    const transaction = vi.fn();
    const client = {
      user: { findUnique: vi.fn(async () => ({ id: 'admin-1', role: 'ADMIN' })) },
      editorialDraft: { findUnique: vi.fn(async () => reviewableDraft({ articleId: 'article-existing', status: 'ARTICLE_DRAFT_CREATED', qualityGate: { id: 'gate-1', automatedDecision: 'PASSED', humanReviewStatus: 'APPROVED' } })) },
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
