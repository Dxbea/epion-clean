import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/epion_test';

const persistWebEvidenceCandidates = vi.fn();
vi.mock('../src/lib/article-generation-core/evidence-gathering.js', () => ({
  persistWebEvidenceCandidates,
}));

const { buildEvidenceDossier } = await import(
  '../src/lib/article-generation-core/evidence-dossier.js'
);
const { prepareEvidenceCorpus } = await import(
  '../src/lib/article-generation-core/evidence-corpus.js'
);
const { resolveArticleGenerationPolicy } = await import(
  '../src/lib/article-generation-core/policy.js'
);
const {
  markEvidenceDossierUsage,
  usedEvidenceUrls,
} = await import('../src/lib/article-generation-core/evidence-consumption.js');

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    canonicalUrl: 'https://publisher.example/story',
    domain: 'publisher.example',
    title: 'Story',
    sourceId: 'source-1',
    status: 'INDEXED',
    isIndexed: true,
    chunks: [{ id: 'chunk-1' }],
    discoveries: [{
      metadata: { provider: 'serper' },
      discoverySource: {
        key: 'internal-editorial-serper',
        connectorType: 'MANUAL',
        configuration: { provider: 'serper' },
      },
    }],
    ...overrides,
  };
}

describe('Article Generation Core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps publication gates strict while allowing degraded user drafts', () => {
    const user = resolveArticleGenerationPolicy('USER_REQUEST');
    const automatic = resolveArticleGenerationPolicy('AUTO_EDITORIAL');

    expect(user.latency.allowDegradedDraft).toBe(true);
    expect(user.publication).toMatchObject({
      draftOnly: true,
      minimumArticleSources: 2,
      minimumIndependentDomains: 2,
      requireVerificationPassed: true,
    });
    expect(automatic.discovery.lowCostFirst).toBe(true);
    expect(automatic.latency.corpusWaitMs).toBe(20 * 60_000);
    expect(automatic.publication.minimumIndependentDomains).toBe(2);
  });

  it('builds a traceable dossier and distinguishes FOUND, PERSISTED, INDEXED and USED', async () => {
    const client = {
      ingestedDocument: {
        findMany: vi.fn(async () => [
          document(),
          document({
            id: 'doc-2',
            canonicalUrl: 'https://context.example/report',
            domain: 'context.example',
            sourceId: null,
            status: 'DISCOVERED',
            isIndexed: false,
            chunks: [],
            discoveries: [{
              metadata: { provider: 'gdelt' },
              discoverySource: {
                key: 'internal-legacy-news-gdelt',
                connectorType: 'MANUAL',
                configuration: { provider: 'gdelt' },
              },
            }],
          }),
        ]),
      },
    } as any;

    const dossier = await buildEvidenceDossier(client, {
      mode: 'USER_REQUEST',
      documentIds: ['doc-1', 'doc-2'],
      usedDocumentIds: ['doc-1'],
      rolesByDocumentId: { 'doc-1': 'PRIMARY', 'doc-2': 'BACKGROUND' },
      claimKeysByDocumentId: { 'doc-1': ['claim-1', 'claim-1'] },
      foundEvidence: [{
        url: 'https://unpersisted.example/item',
        provenance: 'GOOGLE_NEWS_RSS',
      }],
    });

    expect(dossier.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ingestedDocumentId: 'doc-1',
        status: 'USED',
        chunkIds: ['chunk-1'],
        role: 'PRIMARY',
        provenance: 'SERPER',
        claimKeys: ['claim-1'],
      }),
      expect.objectContaining({
        ingestedDocumentId: 'doc-2',
        status: 'PERSISTED',
        provenance: 'GDELT',
      }),
      expect.objectContaining({
        ingestedDocumentId: null,
        status: 'FOUND',
        provenance: 'GOOGLE_NEWS_RSS',
      }),
    ]));
    expect(dossier).toMatchObject({
      traceability: 'DEGRADED',
      persistedDocuments: 2,
      indexedDocuments: 1,
      usedEvidenceItems: 1,
      degradedReasons: ['FOUND_NOT_PERSISTED'],
    });
  });

  it('queues persisted user evidence without waiting for indexing', async () => {
    persistWebEvidenceCandidates.mockResolvedValue({
      provider: 'SERPER',
      mode: 'USER_REQUEST',
      considered: 1,
      persisted: [{
        requestedUrl: 'https://publisher.example/story',
        canonicalUrl: 'https://publisher.example/story',
        canonicalUrlHash: 'hash-1',
        documentId: 'doc-1',
        discoveryId: 'discovery-1',
      }],
    });
    const add = vi.fn(async () => ({}));
    const client = {
      ingestedDocument: { findMany: vi.fn(async () => [document({
        status: 'DISCOVERED',
        isIndexed: false,
        chunks: [],
      })]) },
    } as any;

    const result = await prepareEvidenceCorpus({
      client,
      documentQueue: { add } as any,
    }, {
      request: { mode: 'USER_REQUEST', topic: 'Story' },
      persistence: {
        provider: 'SERPER',
        candidates: [{ url: 'https://publisher.example/story' }],
      },
      rolesByUrl: { 'https://publisher.example/story': 'PRIMARY' },
    });

    expect(add).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      queuedForCorpus: 1,
      indexingTimedOut: false,
      dossier: {
        traceability: 'COMPLETE',
        degradedReasons: [],
        usedEvidenceItems: 0,
        items: [expect.objectContaining({ status: 'PERSISTED' })],
      },
    });
  });

  it('allows AUTO_EDITORIAL to wait for indexed corpus evidence', async () => {
    persistWebEvidenceCandidates.mockResolvedValue({
      provider: 'SERPER',
      mode: 'AUTO_EDITORIAL',
      considered: 1,
      persisted: [{
        requestedUrl: 'https://publisher.example/story',
        canonicalUrl: 'https://publisher.example/story',
        canonicalUrlHash: 'hash-1',
        documentId: 'doc-1',
        discoveryId: 'discovery-1',
      }],
    });
    const findMany = vi.fn()
      .mockResolvedValueOnce([{ id: 'doc-1', status: 'INDEXED', isIndexed: true }])
      .mockResolvedValueOnce([document()]);
    const client = { ingestedDocument: { findMany } } as any;

    const result = await prepareEvidenceCorpus({
      client,
      documentQueue: { add: vi.fn(async () => ({})) } as any,
    }, {
      request: {
        mode: 'AUTO_EDITORIAL',
        topic: 'Story',
        policy: { latency: { corpusWaitMs: 10 } },
      },
      persistence: {
        provider: 'SERPER',
        candidates: [{ url: 'https://publisher.example/story' }],
      },
    });

    expect(result.indexingTimedOut).toBe(false);
    expect(result.dossier).toMatchObject({
      traceability: 'COMPLETE',
      indexedDocuments: 1,
      usedEvidenceItems: 0,
      items: [expect.objectContaining({ status: 'INDEXED' })],
    });
  });

  it('keeps unpersisted radar/search findings out of final used evidence', () => {
    const dossier = markEvidenceDossierUsage({
      mode: 'USER_REQUEST',
      items: [{
        ingestedDocumentId: null,
        chunkIds: [],
        sourceId: null,
        canonicalUrl: 'https://publisher.example/story',
        discoveredUrls: ['https://publisher.example/story?utm_source=radar'],
        domain: 'publisher.example',
        title: 'Story',
        role: 'CONTEXT',
        status: 'FOUND',
        claimKeys: [],
        provenance: 'GOOGLE_NEWS_RSS',
        traceability: 'DEGRADED',
      }],
      traceability: 'DEGRADED',
      degradedReasons: ['FOUND_NOT_PERSISTED'],
      persistedDocuments: 0,
      indexedDocuments: 0,
      usedEvidenceItems: 0,
    }, {
      sourceUrls: ['https://publisher.example/story?utm_source=radar'],
      claimKeysByUrl: {
        'https://publisher.example/story': ['claim-1'],
      },
    });

    expect(dossier).toMatchObject({
      usedEvidenceItems: 0,
      degradedReasons: [
        'FOUND_NOT_PERSISTED',
        'FOUND_EVIDENCE_USED_FOR_PRIVATE_DRAFT',
      ],
      items: [expect.objectContaining({
        status: 'FOUND',
        claimKeys: ['claim-1'],
      })],
    });
    expect(usedEvidenceUrls(dossier)).toEqual([]);
  });

  it('recomputes USED from the current generation output instead of preserving stale usage', () => {
    const dossier = markEvidenceDossierUsage({
      mode: 'AUTO_EDITORIAL',
      items: [{
        ingestedDocumentId: 'doc-1',
        chunkIds: ['chunk-1'],
        sourceId: 'source-1',
        canonicalUrl: 'https://publisher.example/story',
        domain: 'publisher.example',
        title: 'Story',
        role: 'PRIMARY',
        status: 'USED',
        claimKeys: ['old-claim'],
        provenance: 'RSS',
        traceability: 'COMPLETE',
      }],
      traceability: 'COMPLETE',
      degradedReasons: [],
      persistedDocuments: 1,
      indexedDocuments: 1,
      usedEvidenceItems: 1,
    }, {});

    expect(dossier).toMatchObject({
      usedEvidenceItems: 0,
      items: [expect.objectContaining({
        status: 'INDEXED',
        claimKeys: [],
      })],
    });
  });
});
