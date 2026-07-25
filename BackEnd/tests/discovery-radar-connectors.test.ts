import { describe, expect, it, vi } from 'vitest';
import {
  GdeltDiscoveryConnector,
  GoogleNewsRssDiscoveryConnector,
} from '../src/lib/discovery/connectors/index.js';
import { resolveEditorialDiscoveryProviderFlags } from '../src/lib/discovery/editorial-provider-flags.js';
import type { DiscoverySourceConfig } from '../src/lib/discovery/types.js';

function source(
  connectorType: 'GDELT' | 'GOOGLE_NEWS_RSS',
  overrides: Partial<DiscoverySourceConfig> = {},
): DiscoverySourceConfig {
  return {
    id: `source-${connectorType.toLowerCase()}`,
    key: `fixture-${connectorType.toLowerCase()}`,
    name: `${connectorType} fixture`,
    connectorType,
    endpoint: connectorType === 'GDELT'
      ? 'https://api.gdeltproject.org/api/v2/doc/doc'
      : 'https://news.google.com/rss/search?q=epion',
    enabled: true,
    priority: 0,
    language: 'fr',
    country: 'FR',
    maxItemsPerRun: 20,
    requestTimeoutMs: 10_000,
    accessPolicy: 'ROBOTS_ALLOWED',
    storagePolicy: 'EXCERPT_ONLY',
    ...overrides,
  };
}

describe('bounded discovery radar connectors', () => {
  it('keeps GDELT disabled by default and emits publisher candidates when explicitly enabled', async () => {
    expect(resolveEditorialDiscoveryProviderFlags()).toMatchObject({
      gdeltEnabled: false,
      gdeltKillSwitch: true,
      gdeltMaxQueriesPerRun: 2,
      gdeltMaxResultsPerRun: 10,
    });
    const fetcher = vi.fn(async () => [
      {
        url: 'https://publisher.example/story?utm_source=gdelt',
        title: 'Publisher story',
        publishedAt: '2026-07-25T08:00:00Z',
        domain: 'publisher.example',
      },
    ]);
    const connector = new GdeltDiscoveryConnector(fetcher, {
      EDITORIAL_GDELT_DISCOVERY_ENABLED: 'true',
      EDITORIAL_GDELT_DISCOVERY_KILL_SWITCH: 'false',
      EDITORIAL_GDELT_MAX_QUERIES_PER_RUN: '2',
      EDITORIAL_GDELT_MAX_RESULTS_PER_RUN: '10',
    });

    const batch = await connector.discover({
      source: source('GDELT', {
        configuration: { queries: ['lang:French', 'domain:example.fr'] },
      }),
      now: new Date('2026-07-25T10:00:00Z'),
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(batch.candidates).toEqual([expect.objectContaining({
      url: 'https://publisher.example/story',
      canonicalHint: 'https://publisher.example/story',
      metadata: expect.objectContaining({
        provenance: 'GDELT',
        radarOnly: true,
        publisherDomain: 'publisher.example',
      }),
    })]);
  });

  it('resolves Google News radar links to publisher URLs and drops unresolved Google URLs', async () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><guid>one</guid><title>One</title><link>https://news.google.com/rss/articles/one</link></item>
      <item><guid>two</guid><title>Two</title><link>https://news.google.com/rss/articles/two</link></item>
    </channel></rss>`;
    const fetcher = {
      fetch: vi.fn(async () => ({ body: xml, notModified: false })),
    };
    const resolver = vi.fn(async (url: string) =>
      url.endsWith('/one') ? 'https://publisher.example/article?utm_source=google' : null);
    const connector = new GoogleNewsRssDiscoveryConnector(fetcher as any, resolver, {
      EDITORIAL_GOOGLE_NEWS_DISCOVERY_ENABLED: 'true',
      EDITORIAL_GOOGLE_NEWS_DISCOVERY_KILL_SWITCH: 'false',
      EDITORIAL_GOOGLE_NEWS_MAX_QUERIES_PER_RUN: '2',
      EDITORIAL_GOOGLE_NEWS_MAX_RESULTS_PER_RUN: '10',
    });

    const batch = await connector.discover({
      source: source('GOOGLE_NEWS_RSS'),
      now: new Date('2026-07-25T10:00:00Z'),
    });

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(batch.candidates).toEqual([expect.objectContaining({
      url: 'https://publisher.example/article',
      metadata: expect.objectContaining({
        provenance: 'GOOGLE_NEWS_RSS',
        radarOnly: true,
        googleNewsUrl: 'https://news.google.com/rss/articles/one',
      }),
    })]);
    expect(batch.candidates[0]).not.toHaveProperty('snippet');
    expect(batch.candidates.some((candidate) =>
      new URL(candidate.url).hostname === 'news.google.com')).toBe(false);
  });
});
