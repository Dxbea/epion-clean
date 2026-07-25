import { normalizeArticleSourceUrl } from '../../article-source-service.js';
import { resolveEditorialDiscoveryProviderFlags } from '../editorial-provider-flags.js';
import type {
  DiscoveryBatch,
  DiscoveryConnector,
  DiscoveryContext,
  DiscoverySourceConfig,
} from '../types.js';
import {
  assertDiscoveryAllowed,
  validateConnectorConfig,
} from './config.js';

export interface GdeltRadarResult {
  url: string;
  title?: string;
  publishedAt?: string;
  domain?: string;
  language?: string;
}

export type GdeltRadarFetcher = (
  query: string,
  maximumResults: number,
) => Promise<GdeltRadarResult[]>;

export class GdeltDiscoveryConnector implements DiscoveryConnector {
  readonly type = 'GDELT' as const;

  constructor(
    private readonly fetcher: GdeltRadarFetcher = defaultGdeltFetcher,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  validateConfig(config: DiscoverySourceConfig): void {
    validateConnectorConfig(config, this.type);
  }

  async discover(context: DiscoveryContext): Promise<DiscoveryBatch> {
    this.validateConfig(context.source);
    assertDiscoveryAllowed(context.source);
    const flags = resolveEditorialDiscoveryProviderFlags(this.environment);
    if (!flags.gdeltEnabled || flags.gdeltKillSwitch) {
      throw new Error('Editorial GDELT discovery is disabled or kill-switched');
    }
    const queries = configuredQueries(context.source).slice(0, flags.gdeltMaxQueriesPerRun);
    const maximumResults = Math.min(
      context.source.maxItemsPerRun,
      flags.gdeltMaxResultsPerRun,
    );
    const results = (await Promise.all(queries.map((query) =>
      this.fetcher(query, maximumResults)))).flat();
    const byUrl = new Map<string, GdeltRadarResult>();
    for (const result of results) {
      const url = normalizeArticleSourceUrl(result.url);
      if (!url || byUrl.has(url)) continue;
      byUrl.set(url, { ...result, url });
      if (byUrl.size >= maximumResults) break;
    }
    return {
      candidates: [...byUrl.values()].map((result) => ({
        externalId: result.url,
        url: result.url,
        canonicalHint: result.url,
        title: result.title,
        publishedAt: parsedDate(result.publishedAt),
        language: result.language ?? context.source.language ?? undefined,
        metadata: {
          provider: 'gdelt',
          provenance: 'GDELT',
          radarOnly: true,
          publisherDomain: result.domain ?? domainOf(result.url),
          discoveredAt: context.now.toISOString(),
        },
      })),
    };
  }
}

async function defaultGdeltFetcher(
  query: string,
  maximumResults: number,
): Promise<GdeltRadarResult[]> {
  const { fetchGdeltArticleList } = await import('../../discovery.js');
  return fetchGdeltArticleList(query, maximumResults);
}

function configuredQueries(source: DiscoverySourceConfig): string[] {
  const configured = source.configuration?.queries;
  if (Array.isArray(configured)) {
    const values = configured.filter((value): value is string =>
      typeof value === 'string' && Boolean(value.trim())).map((value) => value.trim());
    if (values.length > 0) return [...new Set(values)];
  }
  const query = source.configuration?.query;
  return [typeof query === 'string' && query.trim() ? query.trim() : 'lang:French'];
}

function parsedDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function domainOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}
