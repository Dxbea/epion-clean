import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  autoPublishVerifiedEditorialArticle,
  EditorialAutoPublicationBlockedError,
} from '../src/lib/editorial-verification/auto-publisher.js';
import { resolveEditorialVerificationRuntimeFlags } from '../src/lib/editorial-verification/runtime-flags.js';

const now = new Date('2026-07-25T08:00:00.000Z');
const contentHash = 'a'.repeat(64);

function flags(overrides: NodeJS.ProcessEnv = {}) {
  return resolveEditorialVerificationRuntimeFlags({
    EDITORIAL_AUTOPUBLISH_ENABLED: 'true',
    EDITORIAL_AUTOPUBLISH_KILL_SWITCH: 'false',
    EDITORIAL_AUTOPUBLISH_SYSTEM_USER_ID: 'system-admin',
    ...overrides,
  });
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1', status: 'ARTICLE_DRAFT_CREATED', contentHash,
    currentRevision: { id: 'revision-1', status: 'GATE_PASSED', contentHash },
    qualityGate: { gateVersion: 'quality-gate-v2', automatedDecision: 'PASSED', evaluatedContentHash: contentHash },
    article: {
      id: 'article-1', status: 'DRAFT', publishedAt: null, categoryId: 'category-1',
      factCheckStatus: 'COMPLETED', factCheckScore: 91, factCheckContentHash: 'fact-hash',
      factCheckData: { status: 'COMPLETED', score: 91, contentHash: 'fact-hash' },
      articleSources: [{ source: { domain: 'inserm.fr' } }, { source: { domain: 'ecb.europa.eu' } }],
    },
    verificationRuns: [{ id: 'run-1', revisionId: 'revision-1', articleId: 'article-1', contentHash, status: 'PASSED' }],
    ...overrides,
  };
}

function input(overrides: Partial<Parameters<typeof autoPublishVerifiedEditorialArticle>[1]> = {}) {
  return {
    draftId: 'draft-1', revisionId: 'revision-1', expectedContentHash: contentHash, verificationRunId: 'run-1',
    flags: flags(), now, environment: { EDITORIAL_VALIDATION_MODE: 'quality_gate' }, ...overrides,
  };
}

function client(draft = state(), publishedToday = 0) {
  const transaction = {
    article: { updateMany: vi.fn(async () => ({ count: 1 })), findUnique: vi.fn() },
    editorialReviewAuditLog: { create: vi.fn(async () => ({})), findUnique: vi.fn() },
  };
  return {
    user: { findUnique: vi.fn(async () => ({ id: 'system-admin', role: 'ADMIN' })) },
    editorialDraft: { findUnique: vi.fn(async () => draft) },
    editorialReviewAuditLog: { count: vi.fn(async () => publishedToday) },
    $transaction: vi.fn(async (callback: any) => callback(transaction)),
    transaction,
  } as unknown as PrismaClient & { transaction: typeof transaction };
}

describe('controlled editorial auto-publication', () => {
  it('is disabled and kill-switched by default', async () => {
    expect(resolveEditorialVerificationRuntimeFlags()).toMatchObject({ autoPublishEnabled: false, autoPublishKillSwitch: true, autoPublishMaxPerDay: 1 });
    await expect(autoPublishVerifiedEditorialArticle(client(), input({ flags: flags({ EDITORIAL_AUTOPUBLISH_ENABLED: 'false' }) })))
      .rejects.toMatchObject({ code: 'AUTOPUBLISH_DISABLED' });
  });

  it('publishes only a current PASSED verification with complete sources, FactScore and category', async () => {
    const mocked = client();
    await expect(autoPublishVerifiedEditorialArticle(mocked, input())).resolves.toMatchObject({ outcome: 'ARTICLE_PUBLISHED', articleId: 'article-1', publishedAt: now });
    expect(mocked.transaction.article.updateMany).toHaveBeenCalledWith({ where: { id: 'article-1', status: 'DRAFT', publishedAt: null }, data: { status: 'PUBLISHED', publishedAt: now } });
    expect(mocked.transaction.editorialReviewAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ARTICLE_PUBLISHED', actorUserId: 'system-admin', operationKey: expect.stringContaining('editorial-autopublish:') }),
    }));
  });

  it.each([
    ['human review mode', state(), input({ environment: { EDITORIAL_VALIDATION_MODE: 'human_review' } }), 'AUTOPUBLISH_VALIDATION_MODE'],
    ['incomplete verification', state({ verificationRuns: [{ id: 'run-1', revisionId: 'revision-1', articleId: 'article-1', contentHash, status: 'HUMAN_REVIEW_REQUIRED' }] }), input(), 'AUTOPUBLISH_VERIFICATION_NOT_PASSED'],
    ['one source', state({ article: { ...state().article, articleSources: [{ source: { domain: 'inserm.fr' } }] } }), input(), 'AUTOPUBLISH_SOURCES_INSUFFICIENT'],
    ['missing category', state({ article: { ...state().article, categoryId: null } }), input(), 'AUTOPUBLISH_ARTICLE_NOT_PUBLIC_READY'],
  ])('leaves the Article DRAFT when %s', async (_label, draft, request, code) => {
    const mocked = client(draft);
    await expect(autoPublishVerifiedEditorialArticle(mocked, request)).rejects.toMatchObject({ name: EditorialAutoPublicationBlockedError.name, code });
    expect(mocked.$transaction).not.toHaveBeenCalled();
  });

  it('honours the daily quota before mutating the Article', async () => {
    const mocked = client(state(), 1);
    await expect(autoPublishVerifiedEditorialArticle(mocked, input())).rejects.toMatchObject({ code: 'AUTOPUBLISH_DAILY_QUOTA_REACHED' });
    expect(mocked.$transaction).not.toHaveBeenCalled();
  });
});
