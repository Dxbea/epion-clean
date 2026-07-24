import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { materializeQualityGateArticleDraft } from '../src/lib/editorial-draft/quality-gate-materializer.js';
import { EDITORIAL_QUALITY_GATE_VERSION } from '../src/lib/editorial-draft/types.js';
import { draftEvidence, validArtifact } from './fixtures/editorial/draft.js';

function draftFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1', briefId: 'brief-1', status: 'READY_FOR_REVIEW', title: validArtifact.title,
    summary: validArtifact.summary, contentHtml: '<section>content</section>', contentHash: 'hash-1',
    structuredContent: validArtifact, generatedAt: new Date('2026-07-22T12:00:00Z'), article: null,
    brief: { dossier: { evidence: draftEvidence.map((item, index) => ({
      ...item,
      id: `brief-evidence-${index + 1}`,
      document: {
        sourceId: `source-${index + 1}`,
        source: {
          id: `source-${index + 1}`,
          domain: item.domain,
          profileData: null,
          profileVersion: null,
          profileConfidence: null,
          lastProfiledAt: null,
          publicTrustLabel: null,
        },
      },
    })) } },
    currentRevision: { id: 'revision-1', version: 1, status: 'GATE_PASSED', contentHash: 'hash-1' },
    qualityGate: { id: 'gate-1', gateVersion: EDITORIAL_QUALITY_GATE_VERSION, evaluatedContentHash: 'hash-1', automatedDecision: 'PASSED' },
    claims: validArtifact.claims.map((claim) => ({
      claimKey: claim.claimKey, verdict: 'SUPPORTED', evidence: [{ briefEvidence: {
        evidenceKey: claim.evidenceKeys[0], canonicalUrl: 'https://example.test/source', documentTitle: 'Source', domain: 'example.test',
      } }],
    })),
    ...overrides,
  };
}

describe('quality-gate Article DRAFT materialization', () => {
  it('creates an Article DRAFT without changing humanReviewStatus', async () => {
    const transaction = {
      article: { create: vi.fn(async () => ({ id: 'article-1' })) },
      articleSource: { upsert: vi.fn(async () => ({})) },
      editorialDraft: { updateMany: vi.fn(async () => ({ count: 1 })) },
      editorialQualityGate: { update: vi.fn(async () => ({})) },
    };
    const client = {
      editorialDraft: { findUnique: vi.fn(async () => draftFixture()) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;

    await expect(materializeQualityGateArticleDraft(client, 'draft-1')).resolves.toEqual({ draftId: 'draft-1', articleId: 'article-1', outcome: 'ARTICLE_DRAFT_CREATED' });
    expect(transaction.article.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DRAFT', generationConfig: expect.objectContaining({ validationMode: 'quality_gate', automaticValidation: 'QUALITY_GATE_PASSED' }) }) }));
    expect(transaction.articleSource.upsert).toHaveBeenCalledTimes(2);
    expect(transaction.articleSource.upsert.mock.calls.map(([input]) => input.create.sourceId)).toEqual(['source-1', 'source-2']);
    expect(transaction.editorialQualityGate.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'gate-1' } }));
  });

  it('blocks a failed quality gate and does not create an Article', async () => {
    const articleCreate = vi.fn();
    const client = {
      editorialDraft: { findUnique: vi.fn(async () => draftFixture({ status: 'QUALITY_FAILED', qualityGate: { id: 'gate-1', gateVersion: EDITORIAL_QUALITY_GATE_VERSION, evaluatedContentHash: 'hash-1', automatedDecision: 'FAILED' } })) },
      $transaction: vi.fn(),
    } as unknown as PrismaClient;
    (client as any).$transaction = vi.fn(async (callback: any) => callback({ article: { create: articleCreate } }));

    await expect(materializeQualityGateArticleDraft(client, 'draft-1')).rejects.toThrow('cannot materialize draft: FAILED');
    expect(articleCreate).not.toHaveBeenCalled();
  });

  it('repairs sources on an existing Article DRAFT without creating a second Article', async () => {
    const transaction = {
      article: { update: vi.fn(async () => ({})) },
      articleSource: { upsert: vi.fn(async () => ({})) },
    };
    const client = {
      editorialDraft: { findUnique: vi.fn(async () => draftFixture({ status: 'ARTICLE_DRAFT_CREATED', article: { id: 'article-existing', status: 'DRAFT' } })) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;

    await expect(materializeQualityGateArticleDraft(client, 'draft-1')).resolves.toEqual({ draftId: 'draft-1', articleId: 'article-existing', outcome: 'ALREADY_CREATED' });
    expect(transaction.articleSource.upsert).toHaveBeenCalledTimes(2);
    expect(transaction.article.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'article-existing' }, data: expect.objectContaining({ structuredContent: expect.any(Object) }) }));
  });

  it('blocks a passed gate whose current revision is not gate-passed', async () => {
    const articleCreate = vi.fn();
    const client = {
      editorialDraft: { findUnique: vi.fn(async () => draftFixture({ currentRevision: { id: 'revision-1', version: 1, status: 'PENDING_CRITIC', contentHash: 'hash-1' } })) },
      $transaction: vi.fn(async (callback: any) => callback({ article: { create: articleCreate } })),
    } as unknown as PrismaClient;

    await expect(materializeQualityGateArticleDraft(client, 'draft-1')).rejects.toThrow('cannot materialize draft: PASSED');
    expect(articleCreate).not.toHaveBeenCalled();
  });
});
