import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/epion_test';

const persistDiscoveredCandidate = vi.fn();
const discoverySourceUpsert = vi.fn();

vi.mock('../src/lib/discovery/corpus-service.js', () => ({
  persistDiscoveredCandidate,
}));

const { persistWebEvidenceCandidates } = await import(
  '../src/lib/article-generation-core/evidence-gathering.js'
);

const discoverySource = {
  id: 'source-serper',
  key: 'internal-editorial-serper',
  name: 'Serper evidence corpus',
  connectorType: 'MANUAL',
  endpoint: 'internal://editorial-serper',
  enabled: false,
  priority: 0,
  language: 'fr',
  country: 'FR',
  sourceId: null,
  maxItemsPerRun: 25,
  requestTimeoutMs: 8_000,
  rateLimitPerHour: null,
  configuration: {},
  cursor: null,
  etag: null,
  lastModified: null,
  accessPolicy: 'ROBOTS_ALLOWED',
  storagePolicy: 'EXCERPT_ONLY',
};

const client = {
  discoverySource: {
    upsert: discoverySourceUpsert,
  },
};

describe('article generation evidence gathering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    discoverySourceUpsert.mockResolvedValue(discoverySource);
    persistDiscoveredCandidate.mockImplementation(async (
      _client: unknown,
      _source: unknown,
      candidate: { url: string },
    ) => ({
      dryRun: false,
      canonicalUrl: candidate.url,
      canonicalUrlHash: `hash:${candidate.url}`,
      documentId: `document:${candidate.url}`,
      discoveryId: `discovery:${candidate.url}`,
    }));
  });

  it('normalizes, deduplicates and persists Serper identities with explicit policy metadata', async () => {
    const result = await persistWebEvidenceCandidates(client as never, {
      mode: 'USER_REQUEST',
      provider: 'SERPER',
      maxCandidates: 2,
      now: new Date('2026-07-25T12:00:00.000Z'),
      candidates: [
        {
          url: 'https://www.example.com/story?utm_source=search',
          title: 'Story',
          snippet: 'Search excerpt',
          publishedAt: '2026-07-24',
          metadata: { searchLane: 'FACTUAL' },
        },
        {
          url: 'https://www.example.com/story',
          title: 'Duplicate story',
        },
        {
          url: 'https://second.example/report',
          title: 'Report',
        },
        {
          url: 'https://third.example/ignored',
          title: 'Over budget',
        },
      ],
    });

    expect(discoverySourceUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'internal-editorial-serper' },
      create: expect.objectContaining({
        enabled: false,
        accessPolicy: 'ROBOTS_ALLOWED',
        storagePolicy: 'EXCERPT_ONLY',
      }),
      update: {
        accessPolicy: 'ROBOTS_ALLOWED',
        storagePolicy: 'EXCERPT_ONLY',
      },
    }));
    expect(persistDiscoveredCandidate).toHaveBeenCalledTimes(2);
    expect(persistDiscoveredCandidate).toHaveBeenNthCalledWith(
      1,
      client,
      discoverySource,
      expect.objectContaining({
        url: 'https://www.example.com/story',
        snippet: 'Search excerpt',
        metadata: expect.objectContaining({
          provider: 'serper',
          articleGenerationMode: 'USER_REQUEST',
          evidencePersistenceVersion: 1,
          searchLane: 'FACTUAL',
        }),
      }),
      { now: new Date('2026-07-25T12:00:00.000Z') },
    );
    expect(result).toMatchObject({
      provider: 'SERPER',
      mode: 'USER_REQUEST',
      considered: 2,
    });
    expect(result.persisted).toHaveLength(2);
  });

  it('does not touch the database when there are no valid candidates', async () => {
    await expect(persistWebEvidenceCandidates(client as never, {
      mode: 'AUTO_EDITORIAL',
      provider: 'SERPER',
      candidates: [{ url: 'not-a-url' }, { url: '' }],
    })).resolves.toEqual({
      provider: 'SERPER',
      mode: 'AUTO_EDITORIAL',
      considered: 0,
      persisted: [],
    });

    expect(discoverySourceUpsert).not.toHaveBeenCalled();
    expect(persistDiscoveredCandidate).not.toHaveBeenCalled();
  });

  it('uses a disabled corpus bridge for legacy GDELT discoveries', async () => {
    await persistWebEvidenceCandidates(client as never, {
      mode: 'AUTO_EDITORIAL',
      provider: 'GDELT',
      maxCandidates: 1,
      candidates: [{ url: 'https://example.com/gdelt-story' }],
    });

    expect(discoverySourceUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'internal-legacy-news-gdelt' },
      create: expect.objectContaining({
        connectorType: 'MANUAL',
        endpoint: 'internal://legacy-news/gdelt',
        enabled: false,
        configuration: expect.objectContaining({
          provider: 'gdelt',
          legacyNewsBridge: true,
        }),
      }),
    }));
  });

  it('rejects evidence budgets outside the bounded policy', async () => {
    await expect(persistWebEvidenceCandidates(client as never, {
      mode: 'USER_REQUEST',
      provider: 'SERPER',
      maxCandidates: 51,
      candidates: [{ url: 'https://example.com/story' }],
    })).rejects.toThrow('maxCandidates must be an integer between 1 and 50');
  });
});
