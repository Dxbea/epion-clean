import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/epion_test';

const persistDiscoveredCandidate = vi.fn();
vi.mock('../src/lib/discovery/corpus-service.js', () => ({ persistDiscoveredCandidate }));

const {
  buildEditorialSerperQueries,
  enrichEditorialEvidenceWithSerper,
} = await import('../src/lib/editorial-verification/serper-enrichment.js');

describe('conditional editorial Serper enrichment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds only the lanes required by corpus gaps', () => {
    expect(buildEditorialSerperQueries('Sujet', ['MISSING_PRIMARY_SOURCE', 'MISSING_COUNTERPOINT']))
      .toEqual([
        expect.objectContaining({ lane: 'PRIMARY' }),
        expect.objectContaining({ lane: 'COUNTERPOINT' }),
      ]);
    expect(buildEditorialSerperQueries('Sujet', ['INSUFFICIENT_CLAIM_COVERAGE']))
      .toEqual([
        expect.objectContaining({ lane: 'PRIMARY' }),
        expect.objectContaining({ lane: 'CONTEXT' }),
      ]);
  });

  it('persists diverse Serper results through the idempotent corpus service', async () => {
    const discoverySource = { upsert: vi.fn(async () => ({
      id: 'serper-source', key: 'internal-editorial-serper', name: 'Serper', connectorType: 'MANUAL',
      endpoint: 'internal://editorial-serper', enabled: false, priority: 0, language: 'fr', country: 'FR',
      sourceId: null, maxItemsPerRun: 10, requestTimeoutMs: 8000, rateLimitPerHour: null,
      configuration: {}, cursor: null, etag: null, lastModified: null,
      accessPolicy: 'METADATA_ONLY', storagePolicy: 'METADATA_ONLY',
    })) };
    const client = {
      discoverySource,
      ingestedDocument: {
        findUnique: vi.fn(async ({ where }: any) => ({
          content: `Indexed content for ${where.id}`,
          status: 'INDEXED',
          isIndexed: true,
          publishedAt: null,
          sourceId: null,
        })),
        findMany: vi.fn(async () => [
          {
            id: 'doc-official', canonicalUrl: 'https://agency.gouv.fr/report',
            domain: 'agency.gouv.fr', title: 'Official', sourceId: null,
            status: 'INDEXED', isIndexed: true, chunks: [{ id: 'chunk-official' }],
            discoveries: [{ metadata: { provider: 'serper' }, discoverySource: { key: 'internal-editorial-serper', connectorType: 'MANUAL', configuration: { provider: 'serper' } } }],
          },
          {
            id: 'doc-counter', canonicalUrl: 'https://counter.example/view',
            domain: 'counter.example', title: 'Counterpoint', sourceId: null,
            status: 'INDEXED', isIndexed: true, chunks: [{ id: 'chunk-counter' }],
            discoveries: [{ metadata: { provider: 'serper' }, discoverySource: { key: 'internal-editorial-serper', connectorType: 'MANUAL', configuration: { provider: 'serper' } } }],
          },
          {
            id: 'doc-other', canonicalUrl: 'https://agency.gouv.fr/other',
            domain: 'agency.gouv.fr', title: 'Other', sourceId: null,
            status: 'INDEXED', isIndexed: true, chunks: [{ id: 'chunk-other' }],
            discoveries: [{ metadata: { provider: 'serper' }, discoverySource: { key: 'internal-editorial-serper', connectorType: 'MANUAL', configuration: { provider: 'serper' } } }],
          },
        ]),
      },
    } as any;
    const searcher = vi.fn(async (query: string) => query.includes('officielle')
      ? [
          { title: 'Official', url: 'https://agency.gouv.fr/report?utm_source=x', content: 'Official facts', score: 1 },
          { title: 'Same domain', url: 'https://agency.gouv.fr/other', content: 'Other', score: 0.9 },
        ]
      : [{ title: 'Counterpoint', url: 'https://counter.example/view', content: 'Counterpoint', score: 1 }]);
    persistDiscoveredCandidate
      .mockResolvedValueOnce({ dryRun: false, documentId: 'doc-official', discoveryId: 'disc-1', canonicalUrl: 'https://agency.gouv.fr/report', canonicalUrlHash: 'h1' })
      .mockResolvedValueOnce({ dryRun: false, documentId: 'doc-counter', discoveryId: 'disc-2', canonicalUrl: 'https://counter.example/view', canonicalUrlHash: 'h2' })
      .mockResolvedValueOnce({ dryRun: false, documentId: 'doc-other', discoveryId: 'disc-3', canonicalUrl: 'https://agency.gouv.fr/other', canonicalUrlHash: 'h3' });

    const result = await enrichEditorialEvidenceWithSerper(client, {
      topic: 'Sujet',
      reasons: ['MISSING_PRIMARY_SOURCE', 'MISSING_COUNTERPOINT'],
      existingEvidence: [],
      now: new Date('2026-07-20T10:00:00.000Z'),
    }, searcher, vi.fn(async (documentId: string) => ({
      documentId,
      outcome: 'INDEXED',
      reason: null,
      contentHash: 'hash',
      duplicateOfId: null,
      extractedCharacters: 100,
      chunks: 1,
      inputTokens: null,
      estimatedCostMicros: null,
    })));

    expect(searcher).toHaveBeenCalledTimes(2);
    expect(discoverySource.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'internal-editorial-serper' },
      create: expect.objectContaining({ enabled: false, accessPolicy: 'ROBOTS_ALLOWED', storagePolicy: 'EXCERPT_ONLY' }),
    }));
    expect(persistDiscoveredCandidate).toHaveBeenCalledTimes(3);
    expect(persistDiscoveredCandidate.mock.calls[0][2]).toMatchObject({
      url: 'https://agency.gouv.fr/report',
      metadata: expect.objectContaining({ provider: 'serper', editorialLane: 'PRIMARY' }),
    });
    expect(result.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ documentId: 'doc-official', origin: 'SERPER', officialStatement: true }),
      expect.objectContaining({ documentId: 'doc-counter', lane: 'COUNTERPOINT' }),
    ]));
    expect(result.dossier).toMatchObject({
      mode: 'AUTO_EDITORIAL',
      traceability: 'COMPLETE',
      indexedDocuments: 3,
    });
  });

  it('does not call Serper or touch the corpus when no enrichment reason exists', async () => {
    const searcher = vi.fn();
    const result = await enrichEditorialEvidenceWithSerper({} as any, {
      topic: 'Sujet', reasons: [], existingEvidence: [],
    }, searcher);
    expect(result).toEqual({
      queries: [],
      evidence: [],
      documentIds: [],
      dossier: {
        mode: 'AUTO_EDITORIAL',
        items: [],
        traceability: 'COMPLETE',
        degradedReasons: [],
        persistedDocuments: 0,
        indexedDocuments: 0,
        usedEvidenceItems: 0,
      },
    });
    expect(searcher).not.toHaveBeenCalled();
    expect(persistDiscoveredCandidate).not.toHaveBeenCalled();
  });
});
