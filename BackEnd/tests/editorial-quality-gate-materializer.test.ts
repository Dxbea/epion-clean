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
        canonicalUrl: item.canonicalUrl,
        url: item.canonicalUrl,
        sourceId: `source-${index + 1}`,
        source: {
          id: `source-${index + 1}`,
          domain: item.domain,
          name: `Source ${index + 1}`,
          trustScore: 80 + index,
          reliability: 'HIGH',
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
    claims: validArtifact.claims.map((claim) => {
      const proof = draftEvidence.find((item) => item.evidenceKey === claim.evidenceKeys[0])!;
      const sourceNumber = proof.evidenceKey === 'ev_one' ? 1 : 2;
      return {
        claimKey: claim.claimKey,
        verdict: 'SUPPORTED',
        evidence: [{ briefEvidence: {
          ...proof,
          id: `brief-evidence-${sourceNumber}`,
          document: {
            canonicalUrl: proof.canonicalUrl,
            url: proof.canonicalUrl,
            sourceId: `source-${sourceNumber}`,
            source: {
              id: `source-${sourceNumber}`,
              domain: proof.domain,
              name: `Source ${sourceNumber}`,
              trustScore: 79 + sourceNumber,
              reliability: 'HIGH',
              profileData: null,
              profileVersion: null,
              profileConfidence: null,
              lastProfiledAt: null,
              publicTrustLabel: null,
            },
          },
        } }],
      };
    }),
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
    expect(transaction.articleSource.upsert.mock.calls[1][0].create.profileSnapshot.sourceMetadata).toEqual(expect.objectContaining({ domain: 'two.example', trustScore: 81, reliability: 'HIGH', name: 'Source 2' }));
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

  it.each([
    ['brief canonicalUrl', 'https://fallback.example/brief', 'https://fallback.example/document', 'https://fallback.example/brief'],
    ['document canonicalUrl', null, 'https://fallback.example/document', 'https://fallback.example/document'],
    ['document url', null, null, 'https://fallback.example/raw'],
  ])('uses the %s URL fallback through relational claim evidence', async (_label, briefCanonicalUrl, documentCanonicalUrl, expectedUrl) => {
    const base = draftFixture() as any;
    const proof = base.claims[0].evidence[0].briefEvidence;
    const relationalProof = {
      ...proof,
      canonicalUrl: briefCanonicalUrl,
      domain: 'fallback.example',
      document: {
        ...proof.document,
        canonicalUrl: documentCanonicalUrl,
        url: documentCanonicalUrl ?? 'https://fallback.example/raw',
        source: { ...proof.document.source, domain: 'www.fallback.example' },
      },
    };
    const transaction = {
      article: { create: vi.fn(async () => ({ id: 'article-fallback' })) },
      articleSource: { upsert: vi.fn(async () => ({})) },
      editorialDraft: { updateMany: vi.fn(async () => ({ count: 1 })) },
      editorialQualityGate: { update: vi.fn(async () => ({})) },
    };
    const client = {
      editorialDraft: { findUnique: vi.fn(async () => draftFixture({
        brief: { dossier: { evidence: [] } },
        claims: [{ claimKey: 'claim_1', verdict: 'SUPPORTED', evidence: [{ citationOrder: 0, briefEvidence: relationalProof }] }],
      })) },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;

    await expect(materializeQualityGateArticleDraft(client, 'draft-1')).resolves.toMatchObject({ articleId: 'article-fallback' });
    expect(transaction.articleSource.upsert).toHaveBeenCalledTimes(1);
    expect(transaction.articleSource.upsert.mock.calls[0][0].create.sourceUrl).toBe(expectedUrl);
  });

  it('refuses explicitly when no relational evidence can materialize an ArticleSource', async () => {
    const client = {
      editorialDraft: { findUnique: vi.fn(async () => draftFixture({ brief: { dossier: { evidence: [] } }, claims: [] })) },
      $transaction: vi.fn(),
    } as unknown as PrismaClient;

    await expect(materializeQualityGateArticleDraft(client, 'draft-1')).rejects.toThrow('ArticleSource repair did not materialize any source');
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
