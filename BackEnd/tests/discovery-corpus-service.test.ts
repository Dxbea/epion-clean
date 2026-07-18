import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  CorpusIdentityConflictError,
  persistDiscoveredCandidate,
  persistDiscoveryBatch,
  prepareCorpusUpsert,
  type CorpusPersistenceClient,
} from '../src/lib/discovery/corpus-service.js';
import type { DiscoverySourceConfig } from '../src/lib/discovery/types.js';

function source(overrides: Partial<DiscoverySourceConfig> = {}): DiscoverySourceConfig {
  return {
    id: 'discovery-source-1',
    key: 'fixture-rss',
    name: 'Fixture RSS',
    connectorType: 'RSS',
    endpoint: 'https://example.com/feed.xml',
    enabled: false,
    priority: 0,
    language: 'fr',
    sourceId: 'durable-source-1',
    maxItemsPerRun: 100,
    requestTimeoutMs: 10_000,
    accessPolicy: 'FEED_ONLY',
    storagePolicy: 'METADATA_ONLY',
    ...overrides,
  };
}

function transactionMocks() {
  return {
    ingestedDocument: {
      upsert: vi.fn(async () => ({ id: 'document-1' })),
    },
    documentDiscovery: {
      findMany: vi.fn(async () => [] as Array<{ id: string }>),
      create: vi.fn(async () => ({ id: 'discovery-1' })),
      update: vi.fn(async () => ({ id: 'discovery-1' })),
    },
  };
}

function persistenceClient(transaction: ReturnType<typeof transactionMocks>) {
  return {
    $transaction: vi.fn(async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transaction as unknown as Prisma.TransactionClient)),
  } as unknown as CorpusPersistenceClient;
}

describe('discovery corpus persistence', () => {
  it('prepares an inspectable dry-run without opening a transaction', async () => {
    const client = { $transaction: vi.fn() } as unknown as CorpusPersistenceClient;
    const now = new Date('2026-07-18T12:00:00Z');

    const result = await persistDiscoveredCandidate(client, source(), {
      externalId: ' item-42 ',
      url: 'https://www.example.com/story?utm_source=rss&id=42',
      canonicalHint: 'https://example.com/story?id=42',
    }, { dryRun: true, now });

    expect(result).toMatchObject({
      dryRun: true,
      prepared: {
        document: {
          canonicalUrl: 'https://example.com/story?id=42',
          domain: 'example.com',
        },
        discovery: {
          externalId: 'item-42',
          discoveredUrlHash: expect.any(String),
          canonicalHintAccepted: true,
          observedAt: now,
        },
      },
    });
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('upserts one canonical document and creates its first source occurrence', async () => {
    const transaction = transactionMocks();
    const client = persistenceClient(transaction);

    const result = await persistDiscoveredCandidate(client, source(), {
      externalId: 'item-42',
      url: 'https://example.com/story?utm_medium=rss&id=42',
      title: 'Sujet',
      authors: ['Auteur'],
    }, { now: new Date('2026-07-18T12:00:00Z') });

    expect(result).toMatchObject({
      dryRun: false,
      documentId: 'document-1',
      discoveryId: 'discovery-1',
      canonicalUrl: 'https://example.com/story?id=42',
    });
    expect(transaction.ingestedDocument.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { canonicalUrlHash: expect.any(String) },
      create: expect.objectContaining({
        sourceId: 'durable-source-1',
        accessPolicy: 'FEED_ONLY',
        metadata: expect.objectContaining({ authors: ['Auteur'] }),
      }),
    }));
    expect(transaction.documentDiscovery.create).toHaveBeenCalledOnce();
    expect(transaction.documentDiscovery.update).not.toHaveBeenCalled();
  });

  it('updates the same occurrence on repeated source discovery', async () => {
    const transaction = transactionMocks();
    transaction.documentDiscovery.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'discovery-1' }]);
    const client = persistenceClient(transaction);

    await persistDiscoveredCandidate(client, source(), {
      externalId: 'item-42',
      url: 'https://example.com/story?id=42&utm_source=first',
    });
    await persistDiscoveredCandidate(client, source(), {
      externalId: 'item-42',
      url: 'https://example.com/story?utm_source=second&id=42',
    });

    expect(transaction.documentDiscovery.create).toHaveBeenCalledOnce();
    expect(transaction.documentDiscovery.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'discovery-1' },
      data: expect.objectContaining({
        seenCount: { increment: 1 },
        discoveredUrlHash: expect.any(String),
      }),
    }));
    const documentHashes = transaction.ingestedDocument.upsert.mock.calls
      .map(([argument]) => argument.where.canonicalUrlHash);
    expect(new Set(documentHashes).size).toBe(1);
  });

  it.each(['P2034', 'P2002'])('retries concurrency error %s before persisting', async (code) => {
    const transaction = transactionMocks();
    let attempts = 0;
    const client = {
      $transaction: vi.fn(async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        attempts++;
        if (attempts === 1) throw Object.assign(new Error('concurrency conflict'), { code });
        return operation(transaction as unknown as Prisma.TransactionClient);
      }),
    } as unknown as CorpusPersistenceClient;

    await persistDiscoveredCandidate(client, source(), {
      url: 'https://example.com/concurrent',
    });

    expect(client.$transaction).toHaveBeenCalledTimes(2);
  });

  it('fails closed when external ID and URL match two existing occurrences', async () => {
    const transaction = transactionMocks();
    transaction.documentDiscovery.findMany.mockResolvedValue([
      { id: 'by-url' },
      { id: 'by-external-id' },
    ]);
    const client = persistenceClient(transaction);

    await expect(persistDiscoveredCandidate(client, source(), {
      externalId: 'item-42',
      url: 'https://example.com/collision',
    })).rejects.toBeInstanceOf(CorpusIdentityConflictError);
    expect(transaction.documentDiscovery.create).not.toHaveBeenCalled();
    expect(transaction.documentDiscovery.update).not.toHaveBeenCalled();
  });

  it('caps batch persistence at the configured per-run limit', async () => {
    const client = { $transaction: vi.fn() } as unknown as CorpusPersistenceClient;
    const limitedSource = source({ maxItemsPerRun: 2 });

    const results = await persistDiscoveryBatch(client, limitedSource, {
      candidates: [
        { url: 'https://example.com/1' },
        { url: 'https://example.com/2' },
        { url: 'https://example.com/3' },
      ],
    }, { dryRun: true });

    expect(results).toHaveLength(2);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('keeps observed and canonical hashes distinct when a hint changes host form', () => {
    const prepared = prepareCorpusUpsert(source(), {
      url: 'https://www.example.com/story',
      canonicalHint: 'https://example.com/story',
    });

    expect(prepared.document.canonicalUrl).toBe('https://example.com/story');
    expect(prepared.discovery.discoveredUrl).toBe('https://www.example.com/story');
    expect(prepared.discovery.discoveredUrlHash)
      .not.toBe(prepared.document.canonicalUrlHash);
  });
});
