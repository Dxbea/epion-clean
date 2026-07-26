import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  buildEditorialRunIdempotencyKey,
  EditorialRunInProgressError,
  resolveEditorialClusteringConfig,
  runEditorialShadow,
} from '../src/lib/editorial-shadow/editorial-run-service.js';

const windowStart = new Date('2026-07-17T12:00:00Z');
const windowEnd = new Date('2026-07-18T12:00:00Z');
const now = new Date('2026-07-18T12:30:00Z');
const config = resolveEditorialClusteringConfig({ proposalScoreThreshold: 40 });

function vector(first: number, second: number): string {
  const values = Array.from({ length: 1_536 }, () => 0);
  values[0] = first;
  values[1] = second;
  return `[${values.join(',')}]`;
}

function runRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    idempotencyKey: buildEditorialRunIdempotencyKey({
      windowStart,
      windowEnd,
      embeddingModel: 'text-embedding-3-small',
      config,
    }),
    mode: 'SHADOW',
    status: 'PENDING',
    windowStart,
    windowEnd,
    algorithmVersion: 'event-clustering-v1',
    embeddingModel: 'text-embedding-3-small',
    configuration: config,
    startedAt: null,
    completedAt: null,
    leaseExpiresAt: null,
    attempts: 0,
    error: null,
    metrics: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function materializingClient() {
  const rows = [
    {
      id: 'document-a',
      title: 'Tempête : trafic ferroviaire interrompu',
      domain: 'alpha.example',
      language: 'fr',
      sourceId: 'source-a',
      categoryId: 'weather',
      eventAt: new Date('2026-07-18T11:00:00Z'),
      embedding: vector(1, 0),
    },
    {
      id: 'document-b',
      title: 'Le rail perturbé après une forte tempête',
      domain: 'beta.example',
      language: 'fr',
      sourceId: 'source-b',
      categoryId: 'weather',
      eventAt: new Date('2026-07-18T10:30:00Z'),
      embedding: vector(0.93, 0.25),
    },
  ];
  const transaction = {
    editorialTopic: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => ({ id: 'topic-1' })),
    },
    editorialTopicDocument: { createMany: vi.fn(async () => ({ count: 2 })) },
    editorialCandidate: { create: vi.fn(async () => ({ id: 'candidate-1' })) },
    editorialRun: { update: vi.fn(async () => ({})) },
    $executeRaw: vi.fn(async () => 1),
  };
  const client = {
    editorialRun: {
      createMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => runRecord()),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    $queryRaw: vi.fn(async () => rows),
    $transaction: vi.fn(async (operation) => operation(transaction)),
  } as unknown as PrismaClient;
  return { client, transaction };
}

describe('editorial shadow run persistence', () => {
  it('materializes topics and candidates atomically without an Article operation', async () => {
    const { client, transaction } = materializingClient();
    const result = await runEditorialShadow(client, {
      windowStart,
      windowEnd,
      config,
      now,
    });

    expect(result).toMatchObject({
      outcome: 'COMPLETED',
      documentsConsidered: 2,
      topicsCreated: 1,
      candidatesCreated: 1,
    });
    expect(transaction.editorialTopicDocument.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ documentId: 'document-a' }),
        expect.objectContaining({ documentId: 'document-b' }),
      ]),
    });
    expect(transaction.$executeRaw).toHaveBeenCalledOnce();
    expect(transaction.editorialCandidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        topicId: 'topic-1',
        shadowOnly: true,
      }),
      select: { id: true },
    });
    const corpusQuery = vi.mocked(client.$queryRaw).mock.calls[0][0] as unknown as {
      strings: string[];
    };
    const queryText = corpusQuery.strings.join(' ');
    expect(queryText).toContain('AVG(dc.embedding)::text');
    expect(queryText).toContain("d.status = 'INDEXED'");
    expect(queryText).toContain('d."duplicateOfId" IS NULL');
    expect(queryText).not.toContain('"Article"');
    expect((client as unknown as Record<string, unknown>).article).toBeUndefined();
  });

  it('returns a completed run without loading or rematerializing documents', async () => {
    const completed = runRecord({
      status: 'COMPLETED',
      metrics: {
        documentsConsidered: 10,
        topicsCreated: 3,
        candidatesCreated: 3,
        proposedCandidates: 2,
        suppressedCandidates: 1,
        quasiDuplicates: 2,
        durationMs: 120,
      },
    });
    const client = {
      editorialRun: {
        createMany: vi.fn(async () => ({ count: 0 })),
        findUnique: vi.fn(async () => completed),
        updateMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
    } as unknown as PrismaClient;

    await expect(runEditorialShadow(client, { windowStart, windowEnd, config, now }))
      .resolves.toMatchObject({
        outcome: 'ALREADY_COMPLETED',
        documentsConsidered: 10,
        topicsCreated: 3,
      });
    expect(client.editorialRun.updateMany).not.toHaveBeenCalled();
    expect(client.$queryRaw).not.toHaveBeenCalled();
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('enriches a source-poor suppressed candidate before its final decision', async () => {
    const initial = {
      id: 'document-a',
      title: 'Annonce isolée à vérifier',
      domain: 'alpha.example',
      language: 'fr',
      sourceId: 'source-a',
      categoryId: 'news',
      eventAt: new Date('2026-07-18T11:00:00Z'),
      embedding: vector(1, 0),
    };
    const enriched = [{
      ...initial,
      id: 'document-b',
      title: 'Confirmation indépendante de cette annonce',
      domain: 'beta.example',
      sourceId: 'source-b',
      embedding: vector(0.98, 0.1),
    }, {
      ...initial,
      id: 'document-c',
      title: 'Troisieme confirmation independante',
      domain: 'gamma.example',
      sourceId: 'source-c',
      embedding: vector(0.97, 0.12),
    }, {
      ...initial,
      id: 'document-d',
      title: 'Contexte independant supplementaire',
      domain: 'delta.example',
      sourceId: 'source-d',
      embedding: vector(0.96, 0.15),
    }, {
      ...initial,
      id: 'document-e',
      title: 'Cinquieme confirmation independante',
      domain: 'epsilon.example',
      sourceId: 'source-e',
      embedding: vector(0.95, 0.18),
    }, {
      ...initial,
      id: 'document-f',
      title: 'Sixieme confirmation independante',
      domain: 'zeta.example',
      sourceId: 'source-f',
      embedding: vector(0.94, 0.2),
    }, {
      ...initial,
      id: 'document-g',
      title: 'Analyse institutionnelle complementaire',
      domain: 'eta.example',
      sourceId: 'source-g',
      embedding: vector(0.93, 0.22),
    }, {
      ...initial,
      id: 'document-h',
      title: 'Donnees publiques de corroboration',
      domain: 'theta.example',
      sourceId: 'source-h',
      embedding: vector(0.92, 0.24),
    }, {
      ...initial,
      id: 'document-i',
      title: 'Eclairage scientifique distinct',
      domain: 'iota.example',
      sourceId: 'source-i',
      embedding: vector(0.91, 0.26),
    }, {
      ...initial,
      id: 'document-j',
      title: 'Verification factuelle additionnelle',
      domain: 'kappa.example',
      sourceId: 'source-j',
      embedding: vector(0.9, 0.28),
    }];
    const transaction = {
      editorialTopic: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        create: vi.fn(async () => ({ id: 'topic-1' })),
        update: vi.fn(async () => ({})),
      },
      editorialTopicDocument: { createMany: vi.fn(async () => ({ count: 1 })) },
      editorialCandidate: {
        create: vi.fn(async () => ({ id: 'candidate-1' })),
        update: vi.fn(async () => ({})),
      },
      editorialRun: { update: vi.fn(async () => ({})) },
      $executeRaw: vi.fn(async () => 1),
    };
    const client = {
      editorialRun: {
        createMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => runRecord()),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => ({})),
      },
      editorialTopic: {
        findUnique: vi.fn(async () => ({
          documents: [initial, ...enriched].map((document) => ({ documentId: document.id })),
        })),
      },
      $queryRaw: vi.fn(async () => [initial]),
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaClient;
    const enrichTopicSources = vi.fn(async () => ({
      enrichmentStatus: 'SUFFICIENT' as const,
      sourcesFound: 10,
      sourcesAccepted: 9,
      sourcesRejected: 0,
      independentDomainsBefore: 1,
      independentDomainsAfter: 10,
      documentsBefore: 1,
      documentsAfter: 10,
      independentDomains: [
        'alpha.example',
        'beta.example',
        'delta.example',
        'epsilon.example',
        'eta.example',
        'gamma.example',
        'iota.example',
        'kappa.example',
        'theta.example',
        'zeta.example',
      ],
      rejectionReasons: [],
      serperQueries: [],
      reusedCorpusDocuments: enriched.map((document) => document.id),
      newlyIngestedDocuments: [],
    }));

    const result = await runEditorialShadow(client, {
      windowStart,
      windowEnd,
      config,
      now,
      enrichment: {
        enrichTopicSources,
        loadIndexedDocuments: vi.fn(async () => [initial, ...enriched].map((document) => ({
          ...document,
          embedding: document.embedding.slice(1, -1).split(',').map(Number),
        }))),
      },
    });

    expect(enrichTopicSources).toHaveBeenCalledWith(expect.anything(), 'candidate-1', expect.objectContaining({
      requiredDomains: 2,
      minimumDocuments: 10,
      promoteCandidate: false,
    }));
    expect(result.proposedCandidates).toBe(1);
    expect(transaction.editorialCandidate.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'candidate-1' },
      data: expect.objectContaining({ status: 'SHADOW_PROPOSED' }),
    }));
  });

  it('selects an explicitly controlled indexed document without widening normal event-window selection', async () => {
    const { client } = materializingClient();
    await runEditorialShadow(client, {
      windowStart,
      windowEnd,
      config,
      documentIds: ['inserm-document'],
      now,
    });
    const corpusQuery = vi.mocked(client.$queryRaw).mock.calls[0][0] as unknown as { strings: string[] };
    const queryText = corpusQuery.strings.join(' ');
    expect(queryText).toContain('d.id IN');
    expect(queryText).not.toContain('COALESCE(d."publishedAt", d."discoveredAt") >=');
  });

  it('rejects a concurrent run while its database lease is active', async () => {
    const running = runRecord({
      status: 'RUNNING',
      leaseExpiresAt: new Date('2026-07-18T13:00:00Z'),
    });
    const client = {
      editorialRun: {
        createMany: vi.fn(async () => ({ count: 0 })),
        findUnique: vi.fn(async () => running),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    } as unknown as PrismaClient;

    await expect(runEditorialShadow(client, { windowStart, windowEnd, config, now }))
      .rejects.toBeInstanceOf(EditorialRunInProgressError);
  });

  it('validates bounded windows and stable configuration identities', async () => {
    const first = buildEditorialRunIdempotencyKey({
      windowStart,
      windowEnd,
      embeddingModel: 'model',
      config,
    });
    const second = buildEditorialRunIdempotencyKey({
      windowStart,
      windowEnd,
      embeddingModel: 'model',
      config: { ...config },
    });
    expect(first).toBe(second);
    expect(() => resolveEditorialClusteringConfig({ maxDocuments: 0 }))
      .toThrow('maxDocuments');

    await expect(runEditorialShadow({} as PrismaClient, {
      windowStart: windowEnd,
      windowEnd: windowStart,
      config,
      now,
    })).rejects.toThrow('window must be greater than zero');
  });
});
