import type { DiscoverySource, Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { DiscoveryConnectorRegistry } from '../src/lib/discovery/connector-registry.js';
import { DiscoveryMetrics } from '../src/lib/discovery/discovery-metrics.js';
import {
  recordDiscoveryFailure,
  runDiscoverySource,
  type DiscoveryOrchestratorClient,
} from '../src/lib/discovery/discovery-orchestrator.js';
import type { DiscoveryConnector } from '../src/lib/discovery/types.js';

function discoverySource(overrides: Partial<DiscoverySource> = {}): DiscoverySource {
  return {
    id: 'source-1',
    key: 'rss-source',
    name: 'RSS source',
    connectorType: 'RSS',
    endpoint: 'https://example.com/feed.xml',
    enabled: true,
    priority: 10,
    language: 'fr',
    country: 'FR',
    categoryId: null,
    sourceId: null,
    schedule: '@every 30m',
    maxItemsPerRun: 100,
    requestTimeoutMs: 10_000,
    rateLimitPerHour: null,
    configuration: {},
    cursor: null,
    etag: '"old"',
    lastModified: null,
    lastRunAt: null,
    nextRunAt: null,
    lastSuccessAt: null,
    consecutiveFailures: 0,
    disabledReason: null,
    accessPolicy: 'FEED_ONLY',
    storagePolicy: 'METADATA_ONLY',
    licenseNotes: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

function clientFor(source: DiscoverySource) {
  return {
    discoverySource: {
      findUnique: vi.fn(async () => source),
      update: vi.fn(async () => source),
    },
    $transaction: vi.fn(),
  } as unknown as DiscoveryOrchestratorClient;
}

function registryWith(connector: DiscoveryConnector): DiscoveryConnectorRegistry {
  const registry = new DiscoveryConnectorRegistry();
  registry.register(connector);
  return registry;
}

describe('discovery orchestrator', () => {
  it('runs connector to corpus and persists successful source state', async () => {
    const source = discoverySource();
    const client = clientFor(source);
    const connector: DiscoveryConnector = {
      type: 'RSS',
      validateConfig: vi.fn(),
      discover: vi.fn(async () => ({
        candidates: [{ url: 'https://example.com/story' }],
        nextCursor: 'cursor-2',
        etag: '"new"',
        lastModified: 'Fri, 18 Jul 2026 12:00:00 GMT',
      })),
    };
    const persistBatch = vi.fn(async () => [{
      dryRun: false as const,
      documentId: 'document-1',
      discoveryId: 'discovery-1',
      canonicalUrl: 'https://example.com/story',
      canonicalUrlHash: 'hash',
    }]);
    const metrics = new DiscoveryMetrics();
    const now = new Date('2026-07-18T12:00:00Z');

    const result = await runDiscoverySource({
      client,
      registry: registryWith(connector),
      persistBatch,
      metrics,
    }, source.id, { now });

    expect(result).toMatchObject({
      sourceId: source.id,
      candidatesDiscovered: 1,
      nextRunAt: new Date('2026-07-18T12:30:00Z'),
    });
    expect(client.discoverySource.update).toHaveBeenNthCalledWith(1, {
      where: { id: source.id },
      data: { lastRunAt: now },
    });
    expect(client.discoverySource.update).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({
        cursor: 'cursor-2',
        etag: '"new"',
        lastSuccessAt: now,
        consecutiveFailures: 0,
        disabledReason: null,
      }),
    }));
    expect(metrics.snapshot()).toMatchObject({
      runsStarted: 1,
      runsSucceeded: 1,
      candidatesDiscovered: 1,
      documentsPersisted: 1,
    });
  });

  it('allows an explicit disabled-source dry-run without state writes', async () => {
    const source = discoverySource({ enabled: false });
    const client = clientFor(source);
    const connector: DiscoveryConnector = {
      type: 'RSS',
      validateConfig: vi.fn(),
      discover: vi.fn(async () => ({ candidates: [] })),
    };
    const persistBatch = vi.fn(async () => []);

    await expect(runDiscoverySource({
      client,
      registry: registryWith(connector),
      persistBatch,
    }, source.id, { dryRun: true, allowDisabled: true }))
      .resolves.toMatchObject({ dryRun: true, candidatesDiscovered: 0 });
    expect(client.discoverySource.update).not.toHaveBeenCalled();
    expect(persistBatch).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ id: source.id }),
      expect.any(Object),
      expect.objectContaining({ dryRun: true }),
    );
  });

  it('auto-disables a repeatedly failing source and records a bounded reason', async () => {
    const source = discoverySource({
      consecutiveFailures: 4,
      configuration: { maxConsecutiveFailures: 5 } as Prisma.JsonObject,
    });
    const client = clientFor(source);
    const now = new Date('2026-07-18T12:00:00Z');

    const state = await recordDiscoveryFailure(client, source.id, new Error('feed unavailable'), now);

    expect(state).toMatchObject({
      consecutiveFailures: 5,
      disabled: true,
      nextRunAt: null,
    });
    expect(state.disabledReason).toContain('AUTO_DISABLED_AFTER_5_FAILURES');
    expect(client.discoverySource.update).toHaveBeenCalledWith({
      where: { id: source.id },
      data: expect.objectContaining({
        enabled: false,
        consecutiveFailures: 5,
        disabledReason: expect.stringContaining('feed unavailable'),
      }),
    });
  });

  it('backs off a transient source failure without disabling it', async () => {
    const source = discoverySource({ consecutiveFailures: 0 });
    const client = clientFor(source);
    const now = new Date('2026-07-18T12:00:00Z');

    const state = await recordDiscoveryFailure(client, source.id, 'temporary', now);

    expect(state).toEqual({
      consecutiveFailures: 1,
      disabled: false,
      nextRunAt: new Date('2026-07-18T12:05:00Z'),
      disabledReason: null,
    });
  });
});
