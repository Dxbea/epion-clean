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
