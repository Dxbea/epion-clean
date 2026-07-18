import { XMLParser } from 'fast-xml-parser';
import type { DiscoveredDocumentCandidate } from '../types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  removeNSPrefix: true,
});

export class DiscoveryXmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscoveryXmlParseError';
  }
}

export interface ParsedSitemap {
  kind: 'URL_SET' | 'SITEMAP_INDEX';
  candidates: DiscoveredDocumentCandidate[];
  sitemapUrls: string[];
}

export function parseFeedXml(
  xml: string,
  format: 'RSS' | 'ATOM',
  baseUrl: string,
  maxItems: number,
): DiscoveredDocumentCandidate[] {
  const parsed = parseXml(xml);
  const rawEntries = format === 'RSS'
    ? toArray(parsed.rss?.channel?.item)
    : toArray(parsed.feed?.entry);

  if (rawEntries.length === 0 && !hasExpectedFeedRoot(parsed, format)) {
    throw new DiscoveryXmlParseError(`Expected ${format} feed root`);
  }

  return rawEntries
    .map((entry) => format === 'RSS'
      ? parseRssEntry(entry, baseUrl)
      : parseAtomEntry(entry, baseUrl))
    .filter((entry): entry is DiscoveredDocumentCandidate => entry !== null)
    .slice(0, maxItems);
}

export function parseSitemapXml(
  xml: string,
  baseUrl: string,
  maxItems: number,
): ParsedSitemap {
  const parsed = parseXml(xml);

  if (parsed.urlset) {
    const candidates = toArray(parsed.urlset.url)
      .map((entry) => parseSitemapEntry(entry, baseUrl))
      .filter((entry): entry is DiscoveredDocumentCandidate => entry !== null)
      .slice(0, maxItems);

    return { kind: 'URL_SET', candidates, sitemapUrls: [] };
  }

  if (parsed.sitemapindex) {
    const sitemapUrls = toArray(parsed.sitemapindex.sitemap)
      .map((entry) => absoluteUrl(textValue(recordValue(entry, 'loc')), baseUrl))
      .filter((url): url is string => Boolean(url))
      .slice(0, maxItems);

    return { kind: 'SITEMAP_INDEX', candidates: [], sitemapUrls };
  }

  throw new DiscoveryXmlParseError('Expected sitemap urlset or sitemapindex root');
}

function parseRssEntry(entry: unknown, baseUrl: string): DiscoveredDocumentCandidate | null {
  const record = asRecord(entry);
  if (!record) return null;

  const links = linkValues(record.link, baseUrl);
  const guid = textValue(record.guid);
  const guidUrl = absoluteUrl(guid, baseUrl);
  const url = preferredArticleUrl(links) ?? guidUrl;
  if (!url) return null;

  return compactCandidate({
    externalId: guid,
    url,
    canonicalHint: canonicalLink(links),
    title: textValue(record.title),
    snippet: textValue(record.description) ?? textValue(record.summary),
    publishedAt: parsedDate(textValue(record.pubDate) ?? textValue(record.published)),
    sourceUpdatedAt: parsedDate(textValue(record.updated)),
    authors: textArray(record.author ?? record.creator),
    tags: textArray(record.category),
    metadata: { feedFormat: 'RSS' },
  });
}

function parseAtomEntry(entry: unknown, baseUrl: string): DiscoveredDocumentCandidate | null {
  const record = asRecord(entry);
  if (!record) return null;

  const links = linkValues(record.link, baseUrl);
  const url = preferredArticleUrl(links) ?? canonicalLink(links);
  if (!url) return null;

  return compactCandidate({
    externalId: textValue(record.id),
    url,
    canonicalHint: canonicalLink(links),
    title: textValue(record.title),
    snippet: textValue(record.summary) ?? textValue(record.content),
    publishedAt: parsedDate(textValue(record.published)),
    sourceUpdatedAt: parsedDate(textValue(record.updated)),
    authors: toArray(record.author)
      .map((author) => textValue(recordValue(author, 'name')) ?? textValue(author))
      .filter((author): author is string => Boolean(author)),
    tags: toArray(record.category)
      .map((category) => attributeValue(category, 'term') ?? textValue(category))
      .filter((tag): tag is string => Boolean(tag)),
    metadata: { feedFormat: 'ATOM' },
  });
}

function parseSitemapEntry(entry: unknown, baseUrl: string): DiscoveredDocumentCandidate | null {
  const record = asRecord(entry);
  if (!record) return null;

  const url = absoluteUrl(textValue(record.loc), baseUrl);
  if (!url) return null;

  const links = linkValues(record.link, baseUrl);
  const news = asRecord(record.news);

  return compactCandidate({
    url,
    canonicalHint: canonicalLink(links),
    title: textValue(news?.title),
    publishedAt: parsedDate(textValue(news?.publication_date)),
    sourceUpdatedAt: parsedDate(textValue(record.lastmod)),
    metadata: { discoveryFormat: 'SITEMAP' },
  });
}

function parseXml(xml: string): Record<string, any> {
  if (!xml.trim()) throw new DiscoveryXmlParseError('XML document is empty');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new DiscoveryXmlParseError('XML document declarations and entities are not allowed');
  }

  try {
    const parsed = parser.parse(xml);
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid XML root');
    return parsed as Record<string, any>;
  } catch (error) {
    if (error instanceof DiscoveryXmlParseError) throw error;
    throw new DiscoveryXmlParseError(
      `Unable to parse XML: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

function hasExpectedFeedRoot(parsed: Record<string, any>, format: 'RSS' | 'ATOM'): boolean {
  return format === 'RSS' ? Boolean(parsed.rss?.channel) : Boolean(parsed.feed);
}

type LinkValue = { href: string; rel?: string };

function linkValues(value: unknown, baseUrl: string): LinkValue[] {
  return toArray(value)
    .map((link): LinkValue | null => {
      const href = absoluteUrl(attributeValue(link, 'href') ?? textValue(link), baseUrl);
      if (!href) return null;
      const rel = attributeValue(link, 'rel')?.toLowerCase();
      return rel ? { href, rel } : { href };
    })
    .filter((link): link is LinkValue => link !== null);
}

function preferredArticleUrl(links: LinkValue[]): string | undefined {
  return links.find((link) => link.rel === 'alternate')?.href ??
    links.find((link) => !link.rel)?.href;
}

function canonicalLink(links: LinkValue[]): string | undefined {
  return links.find((link) => link.rel === 'canonical')?.href;
}

function compactCandidate(
  candidate: DiscoveredDocumentCandidate,
): DiscoveredDocumentCandidate {
  return Object.fromEntries(
    Object.entries(candidate).filter(([, value]) =>
      value !== undefined && (!Array.isArray(value) || value.length > 0)),
  ) as unknown as DiscoveredDocumentCandidate;
}

function parsedDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function absoluteUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function textArray(value: unknown): string[] {
  return toArray(value)
    .map(textValue)
    .filter((item): item is string => Boolean(item));
}

function textValue(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    return text || undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  return textValue(record['#text']);
}

function attributeValue(value: unknown, name: string): string | undefined {
  return textValue(asRecord(value)?.[`@_${name}`]);
}

function recordValue(value: unknown, name: string): unknown {
  return asRecord(value)?.[name];
}

function asRecord(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
