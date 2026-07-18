import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  AtomDiscoveryConnector,
  RssDiscoveryConnector,
  SitemapDiscoveryConnector,
  SitemapIndexDiscoveryConnector,
} from '../src/lib/discovery/connectors/index.js';
import type {
  XmlFetchRequest,
  XmlFetchResponse,
  XmlFetcher,
} from '../src/lib/discovery/connectors/xml-fetcher.js';
import type { DiscoverySourceConfig } from '../src/lib/discovery/types.js';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/discovery/${name}`, import.meta.url), 'utf8');
}

function source(
  connectorType: DiscoverySourceConfig['connectorType'],
  endpoint: string,
  overrides: Partial<DiscoverySourceConfig> = {},
): DiscoverySourceConfig {
  return {
    id: `source-${connectorType.toLowerCase()}`,
    key: `fixture-${connectorType.toLowerCase()}`,
    name: `${connectorType} fixture`,
    connectorType,
    endpoint,
    enabled: false,
    priority: 0,
    language: 'fr',
    maxItemsPerRun: 100,
    requestTimeoutMs: 10_000,
    accessPolicy: connectorType === 'RSS' || connectorType === 'ATOM'
      ? 'FEED_ONLY'
      : 'ROBOTS_ALLOWED',
    storagePolicy: 'METADATA_ONLY',
    ...overrides,
  };
}

class FixtureFetcher implements XmlFetcher {
  readonly calls: Array<{ url: string; request: XmlFetchRequest }> = [];

  constructor(private readonly responses: Map<string, XmlFetchResponse>) {}

  async fetch(url: string, request: XmlFetchRequest): Promise<XmlFetchResponse> {
    this.calls.push({ url, request });
    const response = this.responses.get(url);
    if (!response) throw new Error(`Missing fixture response: ${url}`);
    return response;
  }
}

describe('passive XML discovery connectors', () => {
  it('discovers RSS and Atom candidates only when explicitly invoked', async () => {
    const rssFetcher = new FixtureFetcher(new Map([
      ['https://example.com/feed.xml', {
        body: fixture('rss.xml'),
        notModified: false,
        etag: '"rss-v1"',
      }],
    ]));
    const atomFetcher = new FixtureFetcher(new Map([
      ['https://example.com/atom.xml', {
        body: fixture('atom.xml'),
        notModified: false,
      }],
    ]));

    const rss = await new RssDiscoveryConnector(rssFetcher).discover({
      source: source('RSS', 'https://example.com/feed.xml'),
      now: new Date('2026-07-18T10:00:00Z'),
    });
    const atom = await new AtomDiscoveryConnector(atomFetcher).discover({
      source: source('ATOM', 'https://example.com/atom.xml'),
      now: new Date('2026-07-18T10:00:00Z'),
    });

    expect(rss.candidates).toHaveLength(2);
    expect(rss.etag).toBe('"rss-v1"');
    expect(atom.candidates).toHaveLength(1);
    expect(rss.candidates.every((candidate) => candidate.language === 'fr')).toBe(true);
  });

  it('validates type, bounds, and blocked access before fetching', async () => {
    const fetcher = { fetch: vi.fn() } as unknown as XmlFetcher;
    const connector = new RssDiscoveryConnector(fetcher);

    expect(() => connector.validateConfig(source('ATOM', 'https://example.com/feed.xml')))
      .toThrow('Expected RSS discovery source');
    expect(() => connector.validateConfig(source('RSS', 'https://example.com/feed.xml', {
      requestTimeoutMs: 100,
    }))).toThrow('requestTimeoutMs must be an integer');
    expect(() => connector.validateConfig(source('RSS', 'http://127.0.0.1/feed.xml')))
      .toThrow('explicit allowPrivateNetwork is required');

    await expect(connector.discover({
      source: source('RSS', 'https://example.com/feed.xml', { accessPolicy: 'BLOCKED' }),
      now: new Date(),
    })).rejects.toThrow('Discovery source is blocked');
    expect(fetcher.fetch).not.toHaveBeenCalled();
  });

  it('preserves conditional response state when a feed is not modified', async () => {
    const fetcher = new FixtureFetcher(new Map([
      ['https://example.com/feed.xml', {
        body: '',
        notModified: true,
      }],
    ]));
    const batch = await new RssDiscoveryConnector(fetcher).discover({
      source: source('RSS', 'https://example.com/feed.xml', {
        etag: '"known"',
        lastModified: 'Fri, 18 Jul 2026 10:00:00 GMT',
      }),
      now: new Date(),
    });

    expect(batch).toEqual({
      candidates: [],
      etag: '"known"',
      lastModified: 'Fri, 18 Jul 2026 10:00:00 GMT',
    });
  });

  it('parses a direct sitemap and recursively follows a sitemap index', async () => {
    const directFetcher = new FixtureFetcher(new Map([
      ['https://example.com/sitemap.xml', {
        body: fixture('sitemap.xml'),
        notModified: false,
      }],
    ]));
    const indexFetcher = new FixtureFetcher(new Map([
      ['https://example.com/sitemaps/index.xml', {
        body: fixture('sitemap-index.xml'),
        notModified: false,
      }],
      ['https://example.com/sitemaps/first.xml', {
        body: fixture('sitemap.xml'),
        notModified: false,
      }],
      ['https://example.com/sitemaps/second.xml', {
        body: fixture('sitemap-second.xml'),
        notModified: false,
      }],
    ]));

    const direct = await new SitemapDiscoveryConnector(directFetcher).discover({
      source: source('SITEMAP', 'https://example.com/sitemap.xml'),
      now: new Date(),
    });
    const indexed = await new SitemapIndexDiscoveryConnector(indexFetcher).discover({
      source: source('SITEMAP_INDEX', 'https://example.com/sitemaps/index.xml'),
      now: new Date(),
    });

    expect(direct.candidates).toHaveLength(1);
    expect(indexed.candidates.map((candidate) => candidate.url)).toEqual([
      'https://www.example.com/world/story/?utm_source=sitemap',
      'https://example.com/science/second',
    ]);
    expect(indexFetcher.calls).toHaveLength(3);
  });

  it('does not silently treat an index as a direct sitemap', async () => {
    const fetcher = new FixtureFetcher(new Map([
      ['https://example.com/sitemap.xml', {
        body: fixture('sitemap-index.xml'),
        notModified: false,
      }],
    ]));

    await expect(new SitemapDiscoveryConnector(fetcher).discover({
      source: source('SITEMAP', 'https://example.com/sitemap.xml'),
      now: new Date(),
    })).rejects.toThrow('configure SITEMAP_INDEX instead');
  });
});
