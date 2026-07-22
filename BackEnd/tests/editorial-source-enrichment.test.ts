import { describe, expect, it, vi } from 'vitest';
import { enrichEditorialTopicSources } from '../src/lib/editorial-source-enrichment/source-enrichment-service.js';

function document(id: string, domain: string, indexed = true, title = `Document source ${id}`) {
  return {
    id,
    domain,
    canonicalUrl: `https://${domain}/${id}`,
    title,
    isIndexed: indexed,
    status: indexed ? 'INDEXED' : 'DISCOVERED',
    duplicateOfId: null,
    robotsAllowed: true,
  };
}

function clientWith(initial: ReturnType<typeof document>, extra: ReturnType<typeof document>[]) {
  const documents = new Map([initial, ...extra].map((item) => [item.id, item]));
  const topic = {
    id: 'topic-1', label: 'Découverte Inserm', language: 'fr',
    documents: [{ documentId: initial.id, role: 'REPRESENTATIVE', document: initial }],
  };
  return {
    editorialCandidate: {
      findUnique: vi.fn(async () => ({ id: 'candidate-1', topic })),
      update: vi.fn(async () => undefined),
    },
    ingestedDocument: {
      findUnique: vi.fn(async ({ where }: any) => documents.get(where.id) ?? null),
    },
    source: { findUnique: vi.fn(async () => null) },
    editorialTopicDocument: { upsert: vi.fn(async () => undefined) },
    editorialTopic: { update: vi.fn(async () => undefined) },
  } as any;
}

describe('editorial multi-source enrichment', () => {
  it('reuses an independent indexed corpus document before calling Serper', async () => {
    const client = clientWith(document('rss', 'inserm.fr'), [document('corpus', 'who.int')]);
    const enrichWithSerper = vi.fn();

    const result = await enrichEditorialTopicSources(client, 'candidate-1', {
      requiredDomains: 2, maximumDocuments: 4,
    }, {
      searchCorpus: vi.fn(async () => [{
        documentId: 'corpus', canonicalUrl: 'https://who.int/corpus', domain: 'who.int',
        title: 'OMS', publishedAt: null, content: 'confirmation indépendante', similarity: 0.86,
      }]),
      enrichWithSerper,
    });

    expect(result).toMatchObject({ enrichmentStatus: 'SUFFICIENT', sourcesAccepted: 1 });
    expect(result.reusedCorpusDocuments).toEqual(['corpus']);
    expect(enrichWithSerper).not.toHaveBeenCalled();
    expect(client.editorialTopicDocument.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ documentId: 'corpus', role: 'EVIDENCE' }),
    }));
  });

  it('uses Serper only when the corpus is insufficient and counts one same-domain result', async () => {
    const client = clientWith(document('rss', 'inserm.fr'), [
      document('serper-a', 'independent.example', false),
      document('serper-b', 'independent.example', false),
    ]);
    const processDocument = vi.fn(async (id: string) => {
      const found = await client.ingestedDocument.findUnique({ where: { id } });
      found.isIndexed = true;
      found.status = 'INDEXED';
      return { documentId: id, outcome: 'INDEXED', reason: null, contentHash: null, duplicateOfId: null, extractedCharacters: 100, chunks: 1, inputTokens: 1, estimatedCostMicros: 1 };
    });

    const result = await enrichEditorialTopicSources(client, 'candidate-1', {
      requiredDomains: 3, maximumDocuments: 4,
    }, {
      searchCorpus: vi.fn(async () => []),
      processDocument,
      enrichWithSerper: vi.fn(async () => ({
        queries: [{ lane: 'CONTEXT', query: 'Découverte Inserm contexte analyse faits sources' }],
        documentIds: ['serper-a', 'serper-b'],
        evidence: [
          { documentId: 'serper-a', domain: 'independent.example' },
          { documentId: 'serper-b', domain: 'independent.example' },
        ],
      })),
    });

    expect(result.enrichmentStatus).toBe('INSUFFICIENT');
    expect(result.independentDomains).toEqual(['independent.example', 'inserm.fr']);
    expect(result.sourcesAccepted).toBe(1);
    expect(result.rejectionReasons).toContainEqual({ documentId: 'serper-b', reason: 'SAME_DOMAIN' });
    expect(result.serperQueries).toHaveLength(1);
  });

  it('rejects a Serper candidate blocked by the standard document policy', async () => {
    const client = clientWith(document('rss', 'inserm.fr'), [document('blocked', 'blocked.example', false)]);
    const result = await enrichEditorialTopicSources(client, 'candidate-1', {
      requiredDomains: 2, maximumDocuments: 4,
    }, {
      searchCorpus: vi.fn(async () => []),
      processDocument: vi.fn(async (id: string) => ({ documentId: id, outcome: 'BLOCKED', reason: 'robots_disallowed', contentHash: null, duplicateOfId: null, extractedCharacters: 0, chunks: 0, inputTokens: null, estimatedCostMicros: null })),
      enrichWithSerper: vi.fn(async () => ({
        queries: [{ lane: 'CONTEXT', query: 'Découverte Inserm contexte analyse faits sources' }], documentIds: ['blocked'],
        evidence: [{ documentId: 'blocked', domain: 'blocked.example' }],
      })),
    });

    expect(result.enrichmentStatus).toBe('INSUFFICIENT');
    expect(result.rejectionReasons).toContainEqual({ documentId: 'blocked', reason: 'ROBOTS_OR_POLICY_BLOCKED' });
  });

  it('does not count a near-identical syndicated title as independent evidence', async () => {
    const client = clientWith(
      document('rss', 'inserm.fr', true, 'Découverte majeure sur la prévention du cancer'),
      [document('syndicated', 'mirror.example', true, 'Découverte majeure sur la prévention du cancer')],
    );
    const result = await enrichEditorialTopicSources(client, 'candidate-1', {
      requiredDomains: 2, maximumDocuments: 4,
    }, {
      searchCorpus: vi.fn(async () => [{
        documentId: 'syndicated', canonicalUrl: 'https://mirror.example/syndicated', domain: 'mirror.example',
        title: 'Découverte majeure sur la prévention du cancer', publishedAt: null, content: 'reprise', similarity: 0.91,
      }]),
      enrichWithSerper: vi.fn(async () => ({ queries: [], documentIds: [], evidence: [] })),
    });

    expect(result.enrichmentStatus).toBe('INSUFFICIENT');
    expect(result.rejectionReasons).toContainEqual({ documentId: 'syndicated', reason: 'QUASI_DUPLICATE' });
  });

  it('rejects an existing source marked unreliable instead of filling the domain threshold', async () => {
    const client = clientWith(document('rss', 'inserm.fr'), [document('weak', 'weak.example')]);
    client.source.findUnique.mockResolvedValue({ trustScore: 20, hasFactCheckFailures: true });
    const result = await enrichEditorialTopicSources(client, 'candidate-1', {
      requiredDomains: 2, maximumDocuments: 4,
    }, {
      searchCorpus: vi.fn(async () => [{
        documentId: 'weak', canonicalUrl: 'https://weak.example/weak', domain: 'weak.example',
        title: 'source faible', publishedAt: null, content: 'faible', similarity: 0.8,
      }]),
      enrichWithSerper: vi.fn(async () => ({ queries: [], documentIds: [], evidence: [] })),
    });

    expect(result.enrichmentStatus).toBe('INSUFFICIENT');
    expect(result.rejectionReasons).toContainEqual({ documentId: 'weak', reason: 'LOW_TRUST_SOURCE' });
  });
});
