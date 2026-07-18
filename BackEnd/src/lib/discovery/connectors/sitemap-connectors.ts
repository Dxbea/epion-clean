import type {
  DiscoveryBatch,
  DiscoveryConnector,
  DiscoveryContext,
  DiscoverySourceConfig,
  DiscoveredDocumentCandidate,
} from '../types.js';
import {
  assertDiscoveryAllowed,
  DiscoveryConnectorConfigError,
  readIntegerConfig,
  validateConnectorConfig,
} from './config.js';
import { parseSitemapXml } from './xml-parsers.js';
import {
  axiosXmlFetcher,
  rootFetchRequest,
  type XmlFetcher,
} from './xml-fetcher.js';

const DEFAULT_MAX_XML_BYTES = 5 * 1024 * 1024;

export class SitemapDiscoveryConnector implements DiscoveryConnector {
  readonly type = 'SITEMAP' as const;

  constructor(private readonly fetcher: XmlFetcher = axiosXmlFetcher) {}

  validateConfig(config: DiscoverySourceConfig): void {
    validateSitemapConfig(config, this.type);
  }

  async discover(context: DiscoveryContext): Promise<DiscoveryBatch> {
    this.validateConfig(context.source);
    assertDiscoveryAllowed(context.source);

    const maxXmlBytes = maxXmlBytesFor(context.source);
    const response = await this.fetcher.fetch(
      context.source.endpoint,
      rootFetchRequest(context, maxXmlBytes),
    );

    if (response.notModified) {
      return unchangedBatch(context, response);
    }

    const parsed = parseSitemapXml(
      response.body,
      context.source.endpoint,
      context.source.maxItemsPerRun,
    );
    if (parsed.kind !== 'URL_SET') {
      throw new DiscoveryConnectorConfigError(
        'SITEMAP connector received a sitemap index; configure SITEMAP_INDEX instead',
      );
    }

    return {
      candidates: withSourceLanguage(parsed.candidates, context.source),
      etag: response.etag,
      lastModified: response.lastModified,
    };
  }
}

export class SitemapIndexDiscoveryConnector implements DiscoveryConnector {
  readonly type = 'SITEMAP_INDEX' as const;

  constructor(private readonly fetcher: XmlFetcher = axiosXmlFetcher) {}

  validateConfig(config: DiscoverySourceConfig): void {
    validateSitemapConfig(config, this.type);
    readIntegerConfig(config, 'maxDepth', 2, 0, 5);
    readIntegerConfig(config, 'maxSitemaps', 100, 1, 1_000);
  }

  async discover(context: DiscoveryContext): Promise<DiscoveryBatch> {
    this.validateConfig(context.source);
    assertDiscoveryAllowed(context.source);

    const maxXmlBytes = maxXmlBytesFor(context.source);
    const rootResponse = await this.fetcher.fetch(
      context.source.endpoint,
      rootFetchRequest(context, maxXmlBytes),
    );

    if (rootResponse.notModified) {
      return unchangedBatch(context, rootResponse);
    }

    const maxDepth = readIntegerConfig(context.source, 'maxDepth', 2, 0, 5);
    const maxSitemaps = readIntegerConfig(context.source, 'maxSitemaps', 100, 1, 1_000);
    const visited = new Set<string>([context.source.endpoint]);
    const candidates: DiscoveredDocumentCandidate[] = [];
    let fetchedSitemaps = 1;

    const visit = async (url: string, body: string, depth: number): Promise<void> => {
      const remaining = context.source.maxItemsPerRun - candidates.length;
      if (remaining <= 0) return;

      const parsed = parseSitemapXml(body, url, Math.max(remaining, maxSitemaps));
      if (parsed.kind === 'URL_SET') {
        candidates.push(...parsed.candidates.slice(0, remaining));
        return;
      }

      if (depth >= maxDepth) return;

      for (const childUrl of parsed.sitemapUrls) {
        if (candidates.length >= context.source.maxItemsPerRun || fetchedSitemaps >= maxSitemaps) {
          break;
        }
        if (visited.has(childUrl)) continue;

        visited.add(childUrl);
        fetchedSitemaps++;
        const childResponse = await this.fetcher.fetch(childUrl, {
          timeoutMs: context.source.requestTimeoutMs,
          signal: context.signal,
          maxBytes: maxXmlBytes,
        });
        if (!childResponse.notModified) {
          await visit(childUrl, childResponse.body, depth + 1);
        }
      }
    };

    await visit(context.source.endpoint, rootResponse.body, 0);

    return {
      candidates: withSourceLanguage(candidates, context.source),
      etag: rootResponse.etag,
      lastModified: rootResponse.lastModified,
    };
  }
}

function validateSitemapConfig(
  config: DiscoverySourceConfig,
  type: 'SITEMAP' | 'SITEMAP_INDEX',
): void {
  validateConnectorConfig(config, type);
  maxXmlBytesFor(config);
}

function maxXmlBytesFor(config: DiscoverySourceConfig): number {
  return readIntegerConfig(
    config,
    'maxXmlBytes',
    DEFAULT_MAX_XML_BYTES,
    64 * 1024,
    20 * 1024 * 1024,
  );
}

function withSourceLanguage(
  candidates: DiscoveredDocumentCandidate[],
  source: DiscoverySourceConfig,
): DiscoveredDocumentCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    language: candidate.language ?? source.language ?? undefined,
  }));
}

function unchangedBatch(
  context: DiscoveryContext,
  response: { etag?: string; lastModified?: string },
): DiscoveryBatch {
  return {
    candidates: [],
    etag: response.etag ?? context.source.etag ?? undefined,
    lastModified: response.lastModified ?? context.source.lastModified ?? undefined,
  };
}
