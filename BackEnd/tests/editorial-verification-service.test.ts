import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyEditorialDraftForFinalization } from '../src/lib/editorial-verification/verification-service.js';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/epion_test';

const now = new Date('2026-07-20T12:00:00.000Z');

function draftFixture() {
  return {
    id: 'draft-1',
    briefId: 'brief-1',
    contentHash: 'content-hash',
    title: 'Verified article',
    summary: 'Summary',
    contentHtml: '<p>Central fact</p>',
    criticModel: 'gpt-4.1-mini',
    article: { id: 'article-1', status: 'DRAFT', factCheckStatus: 'PENDING' },
    currentRevision: {
      id: 'revision-1',
      contentHash: 'content-hash',
      version: 1,
      publicationAuthorizations: [],
      structuredContent: {
        title: 'Verified article', titleClaimKeys: ['claim-1'], summary: 'Summary', summaryClaimKeys: ['claim-1'],
        sections: [{ heading: 'Facts', claimKeys: ['claim-1'] }],
        claims: [{ claimKey: 'claim-1', text: 'Central fact', importance: 'CORE', evidenceKeys: ['ev_1'] }],
      },
    },
    qualityGate: { automatedDecision: 'PASSED', humanReviewStatus: 'APPROVED', publishabilityScore: 88 },
    claims: [{
      claimKey: 'claim-1', text: 'Central fact', importance: 'CORE', verdict: 'SUPPORTED', evidenceKeys: ['ev_1'],
    }],
    brief: {
      structuredContent: {
        schemaVersion: 1,
        topicLabel: 'Topic',
        contradictions: [{ id: 'contra', question: 'Question', assessment: 'Balanced', sides: [
          { position: 'A', evidenceKeys: ['ev_1'] }, { position: 'B', evidenceKeys: ['ev_2'] },
        ] }],
      },
      dossier: {
        candidate: {
          riskLevel: 'LOW',
          topic: { latestEventAt: new Date('2026-07-01T00:00:00.000Z'), language: 'fr' },
        },
        evidence: [
          { evidenceKey: 'ev_1', documentId: 'doc-1', canonicalUrl: 'https://one.example/a', documentTitle: 'One', domain: 'one.example', contentSnapshot: 'Central fact', publishedAt: null, role: 'PRIMARY', document: { sourceId: 'source-1', source: {} } },
          { evidenceKey: 'ev_2', documentId: 'doc-2', canonicalUrl: 'https://two.example/b', documentTitle: 'Two', domain: 'two.example', contentSnapshot: 'Alternative', publishedAt: null, role: 'CONTEXT', document: { sourceId: 'source-2', source: {} } },
        ],
      },
    },
  };
}

function sourceEntry(index: number, domain: string, url: string, durableSourceId: string) {
  return {
    id: index + 1, sourceId: `local-${index}`, durableSourceId, domain, name: domain, url,
    trustScore: 80, type: 'MEDIA', logo: '', description: null, justification: null,
    metrics: null, flags: null, analysisStatus: 'ANALYZED', extractionStatus: 'full',
    role: index === 0 ? 'PRIMARY_EVIDENCE' : 'CONTEXT', provenance: 'EDITORIAL',
    profileData: null, profileVersion: 1, profileConfidence: null, lastProfiledAt: null,
    publicTrustLabel: 'strong', metadata: { supportStrength: 'STRONG' },
  } as any;
}

function clientFixture() {
  const run = {
    id: 'run-1', status: 'PENDING', serperRequired: false, serperDocumentIds: null,
    factCheckScore: null,
  };
  return {
    editorialDraft: { findUnique: vi.fn(async () => draftFixture()) },
    editorialVerificationRun: {
      createMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => run),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    article: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    ingestedDocument: { updateMany: vi.fn(async () => ({ count: 1 })) },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  } as any;
}

function passingAuditor() {
  return {
    model: 'mistral-small-latest',
    audit: vi.fn(async () => ({
      outcome: 'PASSED', available: true, validJson: true, model: 'mistral-small-latest',
      claims: [{ claimKey: 'claim-1', verdict: 'SUPPORTED', evidenceKeys: ['ev_1', 'ev_2'], citationValid: true, contradiction: false, agreesWithPrimary: true, explanation: 'Confirmed' }],
      contradictions: [], invalidEvidenceKeys: [], reasons: [], inputTokens: 10, outputTokens: 5, estimatedCostMicros: null,
    })),
  } as any;
}

describe('editorial verification orchestration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls PR11 finalization only after corpus, Source identity and Mistral gates pass', async () => {
    const client = clientFixture();
    const finalizeArticle = vi.fn(async (_client, _input, options) => {
      const contract = { factCheckScore: 82, factCheckContentHash: 'fact-hash' };
      await options.afterPersist(client, contract);
      return contract;
    });
    const sourceHydrator = {
      hydrate: vi.fn(async (evidence: any, index: number) =>
        sourceEntry(index, evidence.domain, evidence.url, evidence.sourceId)),
    };

    const result = await verifyEditorialDraftForFinalization(client, {
      draftId: 'draft-1', expectedContentHash: 'content-hash',
    }, { mistralAuditor: passingAuditor(), sourceHydrator, finalizeArticle: finalizeArticle as any, now: () => now });

    expect(result).toMatchObject({ outcome: 'FINALIZED', factCheckScore: 82, serperRequired: false });
    expect(finalizeArticle).toHaveBeenCalledWith(client, expect.objectContaining({
      articleId: 'article-1',
      contentScore: 88,
      structuredContent: expect.objectContaining({
        version: 1,
        format: 'epion-article-v1',
        origin: 'EPION_AUTOMATIC_EDITORIAL',
        editorialDraftId: 'draft-1',
        editorialRevisionId: 'revision-1',
      }),
      replaceArticleSources: true,
      sources: expect.arrayContaining([
        expect.objectContaining({ durableSourceId: 'source-1' }),
        expect.objectContaining({ durableSourceId: 'source-2' }),
      ]),
    }), expect.objectContaining({ afterPersist: expect.any(Function) }));
    expect(client.article.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'article-1', status: 'DRAFT' },
      data: expect.objectContaining({ factCheckStatus: 'RUNNING' }),
    }));
    expect(client.ingestedDocument.updateMany).toHaveBeenCalledWith({
      where: { id: 'doc-1', OR: [{ sourceId: null }, { sourceId: 'source-1' }] },
      data: { sourceId: 'source-1' },
    });
    expect(client.editorialVerificationRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PASSED', factCheckScore: 82 }),
    }));
  });

  it('accepts a passed quality gate without human approval in quality_gate mode', async () => {
    const previousMode = process.env.EDITORIAL_VALIDATION_MODE;
    process.env.EDITORIAL_VALIDATION_MODE = 'quality_gate';
    try {
      const client = clientFixture();
      const pendingHumanDraft = draftFixture();
      pendingHumanDraft.qualityGate.humanReviewStatus = 'PENDING';
      client.editorialDraft.findUnique.mockResolvedValue(pendingHumanDraft);
      const finalizeArticle = vi.fn(async (_client, _input, options) => {
        const contract = { factCheckScore: 82, factCheckContentHash: 'fact-hash' };
        await options.afterPersist(client, contract);
        return contract;
      });
      const sourceHydrator = {
        hydrate: vi.fn(async (evidence: any, index: number) => sourceEntry(index, evidence.domain, evidence.url, evidence.sourceId)),
      };

      await expect(verifyEditorialDraftForFinalization(client, { draftId: 'draft-1', expectedContentHash: 'content-hash' }, {
        mistralAuditor: passingAuditor(), sourceHydrator, finalizeArticle: finalizeArticle as any, now: () => now,
      })).resolves.toMatchObject({ outcome: 'FINALIZED' });
      expect(finalizeArticle).toHaveBeenCalled();
    } finally {
      if (previousMode === undefined) delete process.env.EDITORIAL_VALIDATION_MODE;
      else process.env.EDITORIAL_VALIDATION_MODE = previousMode;
    }
  });

  it('keeps the human approval requirement when quality_gate mode is absent', async () => {
    const previousMode = process.env.EDITORIAL_VALIDATION_MODE;
    delete process.env.EDITORIAL_VALIDATION_MODE;
    try {
      const client = clientFixture();
      const pendingHumanDraft = draftFixture();
      pendingHumanDraft.qualityGate.humanReviewStatus = 'PENDING';
      client.editorialDraft.findUnique.mockResolvedValue(pendingHumanDraft);
      await expect(verifyEditorialDraftForFinalization(client, { draftId: 'draft-1', expectedContentHash: 'content-hash' }, {
        mistralAuditor: passingAuditor(), sourceHydrator: { hydrate: vi.fn() } as any,
        finalizeArticle: vi.fn() as any, now: () => now,
      })).rejects.toThrow('existing automated and human gates');
    } finally {
      if (previousMode === undefined) delete process.env.EDITORIAL_VALIDATION_MODE;
      else process.env.EDITORIAL_VALIDATION_MODE = previousMode;
    }
  });

  it('does not require a Mistral counterpoint citation when the draft does not cite counterpoint evidence', async () => {
    const client = clientFixture();
    const mistralAuditor = {
      model: 'mistral-small-latest',
      audit: vi.fn(async () => ({
        outcome: 'PASSED', available: true, validJson: true, model: 'mistral-small-latest',
        claims: [{ claimKey: 'claim-1', verdict: 'SUPPORTED', evidenceKeys: ['ev_1'], citationValid: true, contradiction: false, agreesWithPrimary: true, explanation: 'Confirmed' }],
        contradictions: [], invalidEvidenceKeys: [], reasons: [], inputTokens: 10, outputTokens: 5, estimatedCostMicros: null,
      })),
    } as any;
    const result = await verifyEditorialDraftForFinalization(client, { draftId: 'draft-1', expectedContentHash: 'content-hash' }, {
      mistralAuditor, sourceHydrator: { hydrate: vi.fn(async (evidence: any, index: number) => sourceEntry(index, evidence.domain, evidence.url, evidence.sourceId)) },
      finalizeArticle: vi.fn() as any, now: () => now,
    });
    expect(result.outcome).toBe('HUMAN_REVIEW_REQUIRED');
    expect(result.mistralReasons).toContain('MISTRAL_INSUFFICIENT_CITED_DOMAIN_DIVERSITY');
    expect(result.mistralReasons).not.toContain('MISTRAL_COUNTERPOINT_NOT_CITED');
  });

  it('returns the existing finalized run idempotently for the same revision and hash', async () => {
    const client = clientFixture();
    const storedDraft = draftFixture();
    storedDraft.article.factCheckStatus = 'COMPLETED';
    client.editorialDraft.findUnique.mockResolvedValue(storedDraft);
    client.editorialVerificationRun.findUnique.mockResolvedValue({
      id: 'run-1', status: 'PASSED', serperRequired: true,
      serperDocumentIds: ['doc-serper'], factCheckScore: 83,
    });
    const finalizeArticle = vi.fn();

    const result = await verifyEditorialDraftForFinalization(client, {
      draftId: 'draft-1', expectedContentHash: 'content-hash',
    }, { finalizeArticle: finalizeArticle as any, now: () => now });

    expect(result).toMatchObject({
      outcome: 'ALREADY_FINALIZED', factCheckScore: 83, serperRequired: true, serperDocuments: 1,
    });
    expect(client.editorialVerificationRun.updateMany).not.toHaveBeenCalled();
    expect(finalizeArticle).not.toHaveBeenCalled();
  });

  it('fails closed and never invokes PR11 when Mistral is unavailable', async () => {
    const client = clientFixture();
    const finalizeArticle = vi.fn();
    const mistralAuditor = {
      model: 'mistral-small-latest',
      audit: vi.fn(async () => ({
        outcome: 'HUMAN_REVIEW_REQUIRED', available: false, validJson: true, model: 'mistral-small-latest',
        claims: [], contradictions: [], invalidEvidenceKeys: [], reasons: ['MISTRAL_UNAVAILABLE'],
        inputTokens: null, outputTokens: null, estimatedCostMicros: null,
      })),
    } as any;
    const sourceHydrator = {
      hydrate: vi.fn(async (evidence: any, index: number) =>
        sourceEntry(index, evidence.domain, evidence.url, evidence.sourceId)),
    };

    const result = await verifyEditorialDraftForFinalization(client, {
      draftId: 'draft-1', expectedContentHash: 'content-hash',
    }, { mistralAuditor, sourceHydrator, finalizeArticle: finalizeArticle as any, now: () => now });

    expect(result).toMatchObject({ outcome: 'HUMAN_REVIEW_REQUIRED', factCheckScore: null });
    expect(result.mistralReasons).toContain('MISTRAL_UNAVAILABLE');
    expect(finalizeArticle).not.toHaveBeenCalled();
    expect(client.article.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ factCheckStatus: 'FAILED', factCheckScore: null }),
    }));
  });
});
