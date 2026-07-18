import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { persistDiscoveredCandidate } from '../discovery/corpus-service.js';
import type { DiscoverySourceConfig } from '../discovery/types.js';
import { normalizeArticleSourceUrl } from '../article-source-service.js';
import { searchSerper, type SerperSearchResult } from '../serper.js';
import type {
  EditorialEvidenceLane,
  EditorialSerperReason,
  EditorialVerificationEvidence,
} from './types.js';

const EDITORIAL_SERPER_DISCOVERY_KEY = 'internal-editorial-serper';
const MAX_RESULTS_PER_QUERY = 4;
const MAX_PERSISTED_RESULTS = 10;

export interface EditorialSerperQuery {
  lane: EditorialEvidenceLane;
  query: string;
}

export interface EditorialSerperEnrichmentResult {
  queries: EditorialSerperQuery[];
  evidence: EditorialVerificationEvidence[];
  documentIds: string[];
}

export type EditorialSerperSearcher = (
  query: string,
  options?: { maxResults?: number; gl?: string; hl?: string },
) => Promise<SerperSearchResult[]>;

export function buildEditorialSerperQueries(
  topic: string,
  reasons: EditorialSerperReason[],
): EditorialSerperQuery[] {
  const normalizedTopic = topic.trim();
  const queries: EditorialSerperQuery[] = [];
  if (reasons.includes('MISSING_PRIMARY_SOURCE')) {
    queries.push({ lane: 'PRIMARY', query: `${normalizedTopic} source officielle communiqué rapport données` });
  }
  if (reasons.includes('MISSING_COUNTERPOINT')) {
    queries.push({ lane: 'COUNTERPOINT', query: `${normalizedTopic} réaction critique contradiction contrepoint` });
  }
  if (
    reasons.includes('INSUFFICIENT_DOMAIN_DIVERSITY')
    || reasons.includes('INSUFFICIENT_CLAIM_COVERAGE')
  ) {
    queries.push({ lane: 'CONTEXT', query: `${normalizedTopic} contexte analyse faits sources` });
  }
  if (reasons.includes('RECENT_TOPIC_REQUIRES_REFRESH')) {
    queries.push({ lane: 'CONTEXT', query: `${normalizedTopic} dernières informations mise à jour aujourd'hui` });
  }
  return uniqueQueries(queries);
}

export async function enrichEditorialEvidenceWithSerper(
  client: PrismaClient,
  input: {
    topic: string;
    reasons: EditorialSerperReason[];
    existingEvidence: EditorialVerificationEvidence[];
    language?: string | null;
    country?: string | null;
    now?: Date;
  },
  searcher: EditorialSerperSearcher = searchSerper,
): Promise<EditorialSerperEnrichmentResult> {
  if (input.reasons.length === 0) return { queries: [], evidence: [], documentIds: [] };
  const now = input.now ?? new Date();
  const queries = buildEditorialSerperQueries(input.topic, input.reasons);
  const results = await Promise.all(queries.map(async (query) => ({
    query,
    results: await searcher(query.query, {
      maxResults: MAX_RESULTS_PER_QUERY,
      hl: input.language?.slice(0, 2).toLowerCase() || 'fr',
      gl: input.country?.slice(0, 2).toLowerCase() || 'fr',
    }),
  })));
  const existingUrls = new Set(input.existingEvidence.map((item) => normalizeArticleSourceUrl(item.url)).filter(Boolean));
  const candidates = selectDiverseResults(results.flatMap(({ query, results: laneResults }) =>
    laneResults.map((result) => ({ query, result }))
  )).filter(({ result }) => {
    const url = normalizeArticleSourceUrl(result.url);
    return Boolean(url && !existingUrls.has(url));
  }).slice(0, MAX_PERSISTED_RESULTS);
  const discoverySource = await ensureEditorialSerperDiscoverySource(client);
  const evidence: EditorialVerificationEvidence[] = [];
  for (const { query, result } of candidates) {
    const url = normalizeArticleSourceUrl(result.url);
    if (!url) continue;
    const domain = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const persisted = await persistDiscoveredCandidate(client, discoverySource, {
      externalId: url,
      url,
      canonicalHint: url,
      title: result.title,
      snippet: result.content,
      publishedAt: parseSerperDate(result.publishedDate),
      language: input.language ?? undefined,
      metadata: {
        provider: 'serper',
        editorialLane: query.lane,
        editorialQuery: query.query,
        serperScore: result.score,
      },
    }, { now });
    if (persisted.dryRun) continue;
    evidence.push({
      evidenceKey: `serper_${createHash('sha256').update(url).digest('hex').slice(0, 20)}`,
      documentId: persisted.documentId,
      sourceId: null,
      url: persisted.canonicalUrl,
      title: result.title,
      domain,
      content: result.content,
      publishedAt: parseSerperDate(result.publishedDate) ?? null,
      lane: query.lane,
      origin: 'SERPER',
      query: query.query,
      officialStatement: query.lane === 'PRIMARY' && isOfficialDomain(domain),
    });
  }
  return { queries, evidence, documentIds: evidence.map((item) => item.documentId) };
}

async function ensureEditorialSerperDiscoverySource(client: PrismaClient): Promise<DiscoverySourceConfig> {
  return client.discoverySource.upsert({
    where: { key: EDITORIAL_SERPER_DISCOVERY_KEY },
    create: {
      key: EDITORIAL_SERPER_DISCOVERY_KEY,
      name: 'Editorial Serper enrichment',
      connectorType: 'MANUAL',
      endpoint: 'internal://editorial-serper',
      enabled: false,
      priority: 0,
      language: 'fr',
      country: 'FR',
      maxItemsPerRun: MAX_PERSISTED_RESULTS,
      requestTimeoutMs: 8_000,
      accessPolicy: 'METADATA_ONLY',
      storagePolicy: 'METADATA_ONLY',
      configuration: { provider: 'serper', internalOnly: true },
    },
    update: {},
    select: {
      id: true, key: true, name: true, connectorType: true, endpoint: true, enabled: true,
      priority: true, language: true, country: true, sourceId: true, maxItemsPerRun: true,
      requestTimeoutMs: true, rateLimitPerHour: true, configuration: true, cursor: true,
      etag: true, lastModified: true, accessPolicy: true, storagePolicy: true,
    },
  }) as unknown as Promise<DiscoverySourceConfig>;
}

function selectDiverseResults(
  candidates: Array<{ query: EditorialSerperQuery; result: SerperSearchResult }>,
) {
  const valid = candidates.flatMap((candidate) => {
    const url = normalizeArticleSourceUrl(candidate.result.url);
    if (!url) return [];
    return [{ ...candidate, result: { ...candidate.result, url }, domain: new URL(url).hostname.toLowerCase().replace(/^www\./, '') }];
  });
  const selected: typeof valid = [];
  const seenUrls = new Set<string>();
  const seenDomains = new Set<string>();
  for (const candidate of valid) {
    if (seenUrls.has(candidate.result.url) || seenDomains.has(candidate.domain)) continue;
    selected.push(candidate);
    seenUrls.add(candidate.result.url);
    seenDomains.add(candidate.domain);
  }
  for (const candidate of valid) {
    if (seenUrls.has(candidate.result.url)) continue;
    selected.push(candidate);
    seenUrls.add(candidate.result.url);
  }
  return selected;
}

function uniqueQueries(queries: EditorialSerperQuery[]): EditorialSerperQuery[] {
  const seen = new Set<string>();
  return queries.filter((query) => {
    const key = `${query.lane}:${query.query}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseSerperDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function isOfficialDomain(domain: string): boolean {
  return /(?:\.gouv\.fr|\.gov(?:\.[a-z]{2})?|\.europa\.eu|\.int)$/.test(domain);
}
