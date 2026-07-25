import type { PrismaClient } from '@prisma/client';
import { normalizeArticleSourceUrl } from '../article-source-service.js';
import {
  persistDiscoveredCandidate,
  type CorpusPersistenceClient,
} from '../discovery/corpus-service.js';
import type { DiscoverySourceConfig } from '../discovery/types.js';

export type ArticleGenerationMode = 'USER_REQUEST' | 'AUTO_EDITORIAL';
export type WebEvidenceProvider = 'SERPER' | 'GDELT' | 'SITEMAP' | 'MANUAL';

export interface WebEvidenceCandidate {
  url: string;
  title?: string;
  snippet?: string;
  publishedAt?: Date | string | null;
  language?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PersistWebEvidenceInput {
  mode: ArticleGenerationMode;
  provider: WebEvidenceProvider;
  candidates: WebEvidenceCandidate[];
  maxCandidates?: number;
  now?: Date;
}

export interface PersistedWebEvidence {
  requestedUrl: string;
  canonicalUrl: string;
  canonicalUrlHash: string;
  documentId: string;
  discoveryId: string;
}

export interface PersistWebEvidenceResult {
  provider: WebEvidenceProvider;
  mode: ArticleGenerationMode;
  considered: number;
  persisted: PersistedWebEvidence[];
}

type EvidencePersistenceClient = CorpusPersistenceClient & {
  discoverySource: Pick<PrismaClient['discoverySource'], 'upsert'>;
};

const DEFAULT_MAX_CANDIDATES = 10;
const MAX_CANDIDATES = 50;

export async function persistWebEvidenceCandidates(
  client: EvidencePersistenceClient,
  input: PersistWebEvidenceInput,
): Promise<PersistWebEvidenceResult> {
  const now = input.now ?? new Date();
  const maxCandidates = boundedMaximum(input.maxCandidates);
  const candidates = uniqueCandidates(input.candidates).slice(0, maxCandidates);
  if (candidates.length === 0) {
    return {
      provider: input.provider,
      mode: input.mode,
      considered: 0,
      persisted: [],
    };
  }

  const discoverySource = await ensureEvidenceDiscoverySource(client, input.provider);
  const persisted: PersistedWebEvidence[] = [];

  for (const candidate of candidates) {
    const result = await persistDiscoveredCandidate(client, discoverySource, {
      externalId: candidate.url,
      url: candidate.url,
      canonicalHint: candidate.url,
      title: candidate.title,
      snippet: candidate.snippet,
      publishedAt: parseDate(candidate.publishedAt),
      language: candidate.language ?? discoverySource.language ?? undefined,
      metadata: {
        ...candidate.metadata,
        provider: input.provider.toLowerCase(),
        articleGenerationMode: input.mode,
        evidencePersistenceVersion: 1,
      },
    }, { now });

    if (result.dryRun) continue;
    persisted.push({
      requestedUrl: candidate.url,
      canonicalUrl: result.canonicalUrl,
      canonicalUrlHash: result.canonicalUrlHash,
      documentId: result.documentId,
      discoveryId: result.discoveryId,
    });
  }

  return {
    provider: input.provider,
    mode: input.mode,
    considered: candidates.length,
    persisted,
  };
}

async function ensureEvidenceDiscoverySource(
  client: EvidencePersistenceClient,
  provider: WebEvidenceProvider,
): Promise<DiscoverySourceConfig> {
  const sourceDefinition = evidenceSourceDefinition(provider);

  return client.discoverySource.upsert({
    where: { key: sourceDefinition.key },
    create: {
      key: sourceDefinition.key,
      name: sourceDefinition.name,
      connectorType: 'MANUAL',
      endpoint: sourceDefinition.endpoint,
      enabled: false,
      priority: 0,
      language: 'fr',
      country: 'FR',
      maxItemsPerRun: MAX_CANDIDATES,
      requestTimeoutMs: 8_000,
      accessPolicy: 'ROBOTS_ALLOWED',
      storagePolicy: 'EXCERPT_ONLY',
      configuration: {
        provider: provider.toLowerCase(),
        internalOnly: true,
        articleGenerationModes: ['USER_REQUEST', 'AUTO_EDITORIAL'],
        ...(provider === 'SERPER' ? {} : { legacyNewsBridge: true }),
      },
    },
    update: {
      accessPolicy: 'ROBOTS_ALLOWED',
      storagePolicy: 'EXCERPT_ONLY',
    },
    select: {
      id: true,
      key: true,
      name: true,
      connectorType: true,
      endpoint: true,
      enabled: true,
      priority: true,
      language: true,
      country: true,
      sourceId: true,
      maxItemsPerRun: true,
      requestTimeoutMs: true,
      rateLimitPerHour: true,
      configuration: true,
      cursor: true,
      etag: true,
      lastModified: true,
      accessPolicy: true,
      storagePolicy: true,
    },
  }) as unknown as Promise<DiscoverySourceConfig>;
}

function evidenceSourceDefinition(provider: WebEvidenceProvider): {
  key: string;
  name: string;
  endpoint: string;
} {
  switch (provider) {
    case 'SERPER':
      return {
        key: 'internal-editorial-serper',
        name: 'Serper evidence corpus',
        endpoint: 'internal://editorial-serper',
      };
    case 'GDELT':
      return {
        key: 'internal-legacy-news-gdelt',
        name: 'Legacy GDELT corpus bridge',
        endpoint: 'internal://legacy-news/gdelt',
      };
    case 'SITEMAP':
      return {
        key: 'internal-legacy-news-sitemap',
        name: 'Legacy sitemap corpus bridge',
        endpoint: 'internal://legacy-news/sitemap',
      };
    case 'MANUAL':
      return {
        key: 'internal-legacy-news-manual',
        name: 'Legacy manual news corpus bridge',
        endpoint: 'internal://legacy-news/manual',
      };
  }
}

function uniqueCandidates(candidates: WebEvidenceCandidate[]): WebEvidenceCandidate[] {
  const byUrl = new Map<string, WebEvidenceCandidate>();
  for (const candidate of candidates) {
    const url = normalizeArticleSourceUrl(candidate.url);
    if (!url || byUrl.has(url)) continue;
    byUrl.set(url, { ...candidate, url });
  }
  return [...byUrl.values()];
}

function boundedMaximum(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_CANDIDATES;
  if (!Number.isInteger(value) || value < 1 || value > MAX_CANDIDATES) {
    throw new Error(`maxCandidates must be an integer between 1 and ${MAX_CANDIDATES}`);
  }
  return value;
}

function parseDate(value: Date | string | null | undefined): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
