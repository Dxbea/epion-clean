import axios from 'axios';
import { normalizeArticleSourceUrl } from '../../article-source-service.js';
import { resolveEditorialDiscoveryProviderFlags } from '../editorial-provider-flags.js';
import type {
  DiscoveryBatch,
  DiscoveryConnector,
  DiscoveryContext,
  DiscoverySourceConfig,
  DiscoveredDocumentCandidate,
} from '../types.js';
import {
  assertDiscoveryAllowed,
  validateConnectorConfig,
} from './config.js';
import { parseFeedXml } from './xml-parsers.js';
import {
  axiosXmlFetcher,
  rootFetchRequest,
  type XmlFetcher,
} from './xml-fetcher.js';

export type GoogleNewsPublisherResolver = (
  googleNewsUrl: string,
  timeoutMs: number,
) => Promise<string | null>;

export class GoogleNewsRssDiscoveryConnector implements DiscoveryConnector {
  readonly type = 'GOOGLE_NEWS_RSS' as const;

  constructor(
    private readonly fetcher: XmlFetcher = axiosXmlFetcher,
    private readonly resolver: GoogleNewsPublisherResolver = resolvePublisherUrl,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  validateConfig(config: DiscoverySourceConfig): void {
    validateConnectorConfig(config, this.type);
  }

  async discover(context: DiscoveryContext): Promise<DiscoveryBatch> {
    this.validateConfig(context.source);
    assertDiscoveryAllowed(context.source);
    const flags = resolveEditorialDiscoveryProviderFlags(this.environment);
    if (!flags.googleNewsEnabled || flags.googleNewsKillSwitch) {
      throw new Error('Editorial Google News discovery is disabled or kill-switched');
    }
    const endpoints = configuredEndpoints(context.source)
      .slice(0, flags.googleNewsMaxQueriesPerRun);
    const maximumResults = Math.min(
      context.source.maxItemsPerRun,
      flags.googleNewsMaxResultsPerRun,
    );
    const candidates: DiscoveredDocumentCandidate[] = [];
    const seen = new Set<string>();
    for (const endpoint of endpoints) {
      const response = await this.fetcher.fetch(
        endpoint,
        rootFetchRequest(context, 2 * 1024 * 1024),
      );
      if (response.notModified) continue;
      const radarItems = parseFeedXml(response.body, 'RSS', endpoint, maximumResults);
      for (const item of radarItems) {
        if (candidates.length >= maximumResults) break;
        const publisherUrl = await this.publisherUrl(item, context.source.requestTimeoutMs);
        if (!publisherUrl || seen.has(publisherUrl)) continue;
        seen.add(publisherUrl);
        candidates.push({
          externalId: item.externalId ?? item.url,
          url: publisherUrl,
          canonicalHint: publisherUrl,
          title: item.title,
          publishedAt: item.publishedAt,
          language: item.language ?? context.source.language ?? undefined,
          metadata: {
            provider: 'google_news_rss',
            provenance: 'GOOGLE_NEWS_RSS',
            radarOnly: true,
            googleNewsUrl: item.url,
            discoveredAt: context.now.toISOString(),
          },
        });
      }
    }
    return { candidates };
  }

  private async publisherUrl(
    item: DiscoveredDocumentCandidate,
    timeoutMs: number,
  ): Promise<string | null> {
    const candidate = normalizeArticleSourceUrl(item.canonicalHint ?? item.url);
    if (candidate && !isGoogleNews(candidate)) return candidate;
    const resolved = await this.resolver(item.url, timeoutMs);
    const normalized = normalizeArticleSourceUrl(resolved);
    return normalized && !isGoogleNews(normalized) ? normalized : null;
  }
}

async function resolvePublisherUrl(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const response = await axios.head(url, {
      timeout: timeoutMs,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: { 'User-Agent': 'EpionBot/1.0 (+https://epion.app)' },
    });
    const request = response.request as { res?: { responseUrl?: string } } | undefined;
    return request?.res?.responseUrl ?? response.headers.location ?? null;
  } catch {
    return null;
  }
}

function configuredEndpoints(source: DiscoverySourceConfig): string[] {
  const configured = source.configuration?.endpoints;
  if (!Array.isArray(configured)) return [source.endpoint];
  return [...new Set([
    source.endpoint,
    ...configured.filter((value): value is string =>
      typeof value === 'string' && Boolean(value.trim())).map((value) => value.trim()),
  ])];
}

function isGoogleNews(url: string): boolean {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '') === 'news.google.com';
}
