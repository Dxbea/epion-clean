import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DiscoveryXmlParseError,
  parseFeedXml,
  parseSitemapXml,
} from '../src/lib/discovery/connectors/xml-parsers.js';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/discovery/${name}`, import.meta.url), 'utf8');
}

describe('discovery XML parsers', () => {
  it('parses RSS entries, external IDs, relative URLs, and canonical hints', () => {
    const candidates = parseFeedXml(
      fixture('rss.xml'),
      'RSS',
      'https://example.com/feed.xml',
      10,
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      externalId: 'rss-item-42',
      url: 'https://www.example.com/news/story/?utm_source=rss&id=42',
      canonicalHint: 'https://example.com/news/story?id=42',
      title: 'Premier sujet RSS',
      snippet: 'Résumé du premier sujet.',
      authors: ['Journaliste RSS'],
      tags: ['Technologie'],
    });
    expect(candidates[0].publishedAt?.toISOString()).toBe('2026-07-18T08:30:00.000Z');
    expect(candidates[1].url).toBe('https://example.com/news/second');
  });

  it('parses Atom alternate links and update metadata', () => {
    const [candidate] = parseFeedXml(
      fixture('atom.xml'),
      'ATOM',
      'https://example.com/atom.xml',
      10,
    );

    expect(candidate).toMatchObject({
      externalId: 'tag:example.com,2026:atom-1',
      url: 'https://example.com/atom/story?utm_campaign=feed&page=1',
      canonicalHint: 'https://example.com/atom/story?page=1',
      authors: ['Journaliste Atom'],
      tags: ['International'],
    });
    expect(candidate.publishedAt?.toISOString()).toBe('2026-07-18T09:00:00.000Z');
    expect(candidate.sourceUpdatedAt?.toISOString()).toBe('2026-07-18T09:15:00.000Z');
  });

  it('parses sitemap news metadata and sitemap indexes', () => {
    const sitemap = parseSitemapXml(
      fixture('sitemap.xml'),
      'https://example.com/sitemap.xml',
      10,
    );
    const index = parseSitemapXml(
      fixture('sitemap-index.xml'),
      'https://example.com/sitemaps/index.xml',
      10,
    );

    expect(sitemap.kind).toBe('URL_SET');
    expect(sitemap.candidates[0]).toMatchObject({
      url: 'https://www.example.com/world/story/?utm_source=sitemap',
      canonicalHint: 'https://example.com/world/story',
      title: 'Un sujet depuis le sitemap',
    });
    expect(sitemap.candidates[0].publishedAt?.toISOString())
      .toBe('2026-07-18T09:45:00.000Z');
    expect(index).toEqual({
      kind: 'SITEMAP_INDEX',
      candidates: [],
      sitemapUrls: [
        'https://example.com/sitemaps/first.xml',
        'https://example.com/sitemaps/second.xml',
      ],
    });
  });

  it('rejects unexpected roots and XML entity declarations', () => {
    expect(() => parseFeedXml('<urlset />', 'RSS', 'https://example.com/feed.xml', 10))
      .toThrow(DiscoveryXmlParseError);
    expect(() => parseSitemapXml(
      '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><urlset />',
      'https://example.com/sitemap.xml',
      10,
    )).toThrow('XML document declarations and entities are not allowed');
  });
});
