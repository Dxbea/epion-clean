import { Prisma } from '@prisma/client';
import type {
  DiscoveryBatch,
  DiscoverySourceConfig,
  DiscoveredDocumentCandidate,
} from './types.js';
import {
  buildCanonicalizedDocumentUrl,
  resolveCanonicalizedDocumentUrl,
} from './url-canonicalization.js';

const MAX_EXTERNAL_ID_LENGTH = 4_096;
const MAX_TRANSACTION_ATTEMPTS = 3;

export interface CorpusPersistenceClient {
  $transaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
}

export interface CorpusUpsertOptions {
  dryRun?: boolean;
  now?: Date;
}

export interface PreparedCorpusUpsert {
  document: {
    url: string;
    canonicalUrl: string;
    canonicalUrlHash: string;
    canonicalizationVersion: number;
    domain: string;
  };
  discovery: {
    discoverySourceId: string;
    externalId: string | null;
    discoveredUrl: string;
    discoveredUrlHash: string;
    canonicalHint: string | null;
    canonicalHintAccepted: boolean;
    observedAt: Date;
  };
}

export type CorpusUpsertResult =
  | { dryRun: true; prepared: PreparedCorpusUpsert }
  | {
      dryRun: false;
      documentId: string;
      discoveryId: string;
      canonicalUrl: string;
      canonicalUrlHash: string;
    };

export class InvalidDiscoveryCandidateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDiscoveryCandidateError';
  }
}

export class CorpusIdentityConflictError extends Error {
  constructor(sourceId: string) {
    super(`External ID and discovered URL resolve to different occurrences for source ${sourceId}`);
    this.name = 'CorpusIdentityConflictError';
  }
}

export function prepareCorpusUpsert(
  source: DiscoverySourceConfig,
  candidate: DiscoveredDocumentCandidate,
  now = new Date(),
): PreparedCorpusUpsert {
  const discoveredIdentity = buildCanonicalizedDocumentUrl(candidate.url);
  if (!discoveredIdentity) {
    throw new InvalidDiscoveryCandidateError('Candidate URL must be an absolute HTTP(S) URL');
  }

  const canonicalIdentity = resolveCanonicalizedDocumentUrl(
    candidate.url,
    candidate.canonicalHint,
    {
      allowCrossDomainCanonicalHint:
        source.configuration?.allowCrossDomainCanonicalHints === true,
    },
  );
  if (!canonicalIdentity) {
    throw new InvalidDiscoveryCandidateError('Unable to resolve candidate canonical URL');
  }

  const externalId = normalizeExternalId(candidate.externalId);

  return {
    document: {
      url: discoveredIdentity.originalUrl,
      canonicalUrl: canonicalIdentity.canonicalUrl,
      canonicalUrlHash: canonicalIdentity.canonicalUrlHash,
      canonicalizationVersion: canonicalIdentity.canonicalizationVersion,
      domain: canonicalIdentity.domain,
    },
    discovery: {
      discoverySourceId: source.id,
      externalId,
      discoveredUrl: discoveredIdentity.originalUrl,
      discoveredUrlHash: discoveredIdentity.canonicalUrlHash,
      canonicalHint: canonicalIdentity.canonicalHint,
      canonicalHintAccepted: canonicalIdentity.canonicalHintAccepted,
      observedAt: validDate(now, 'now'),
    },
  };
}

export async function persistDiscoveredCandidate(
  client: CorpusPersistenceClient,
  source: DiscoverySourceConfig,
  candidate: DiscoveredDocumentCandidate,
  options: CorpusUpsertOptions = {},
): Promise<CorpusUpsertResult> {
  const prepared = prepareCorpusUpsert(source, candidate, options.now);
  if (options.dryRun) return { dryRun: true, prepared };

  const result = await withSerializableRetry(client, async (transaction) => {
    const document = await transaction.ingestedDocument.upsert({
      where: { canonicalUrlHash: prepared.document.canonicalUrlHash },
      create: {
        ...prepared.document,
        title: cleanText(candidate.title),
        snippet: cleanText(candidate.snippet),
        language: cleanText(candidate.language ?? source.language),
        publishedAt: optionalDate(candidate.publishedAt),
        sourceUpdatedAt: optionalDate(candidate.sourceUpdatedAt),
        discoveredAt: prepared.discovery.observedAt,
        status: 'DISCOVERED',
        accessPolicy: source.accessPolicy,
        storagePolicy: source.storagePolicy,
        sourceId: source.sourceId ?? null,
        metadata: documentMetadata(candidate),
      },
      update: {
        canonicalUrl: prepared.document.canonicalUrl,
        canonicalizationVersion: prepared.document.canonicalizationVersion,
        domain: prepared.document.domain,
        title: cleanText(candidate.title),
        snippet: cleanText(candidate.snippet),
        language: cleanText(candidate.language ?? source.language),
        publishedAt: optionalDate(candidate.publishedAt),
        sourceUpdatedAt: optionalDate(candidate.sourceUpdatedAt),
        accessPolicy: source.accessPolicy,
        storagePolicy: source.storagePolicy,
        sourceId: source.sourceId ?? undefined,
        metadata: documentMetadata(candidate),
      },
      select: { id: true },
    });

    const identityFilters: Prisma.DocumentDiscoveryWhereInput[] = [
      { discoveredUrlHash: prepared.discovery.discoveredUrlHash },
    ];
    if (prepared.discovery.externalId) {
      identityFilters.push({ externalId: prepared.discovery.externalId });
    }

    const existing = await transaction.documentDiscovery.findMany({
      where: {
        discoverySourceId: prepared.discovery.discoverySourceId,
        OR: identityFilters,
      },
      select: { id: true },
      take: 2,
    });
    if (existing.length > 1) {
      throw new CorpusIdentityConflictError(prepared.discovery.discoverySourceId);
    }

    const canonicalHintWasProvided = typeof candidate.canonicalHint === 'string';
    const discovery = existing[0]
      ? await transaction.documentDiscovery.update({
          where: { id: existing[0].id },
          data: {
            documentId: document.id,
            externalId: prepared.discovery.externalId ?? undefined,
            discoveredUrl: prepared.discovery.discoveredUrl,
            discoveredUrlHash: prepared.discovery.discoveredUrlHash,
            canonicalHint: canonicalHintWasProvided
              ? prepared.discovery.canonicalHint
              : undefined,
            canonicalHintAccepted: canonicalHintWasProvided
              ? prepared.discovery.canonicalHintAccepted
              : undefined,
            lastSeenAt: prepared.discovery.observedAt,
            seenCount: { increment: 1 },
            metadata: occurrenceMetadata(candidate),
          },
          select: { id: true },
        })
      : await transaction.documentDiscovery.create({
          data: {
            documentId: document.id,
            discoverySourceId: prepared.discovery.discoverySourceId,
            externalId: prepared.discovery.externalId,
            discoveredUrl: prepared.discovery.discoveredUrl,
            discoveredUrlHash: prepared.discovery.discoveredUrlHash,
            canonicalHint: prepared.discovery.canonicalHint,
            canonicalHintAccepted: prepared.discovery.canonicalHintAccepted,
            discoveredAt: prepared.discovery.observedAt,
            lastSeenAt: prepared.discovery.observedAt,
            metadata: occurrenceMetadata(candidate),
          },
          select: { id: true },
        });

    return { documentId: document.id, discoveryId: discovery.id };
  });

  return {
    dryRun: false,
    ...result,
    canonicalUrl: prepared.document.canonicalUrl,
    canonicalUrlHash: prepared.document.canonicalUrlHash,
  };
}

export async function persistDiscoveryBatch(
  client: CorpusPersistenceClient,
  source: DiscoverySourceConfig,
  batch: DiscoveryBatch,
  options: CorpusUpsertOptions = {},
): Promise<CorpusUpsertResult[]> {
  const results: CorpusUpsertResult[] = [];
  for (const candidate of batch.candidates.slice(0, source.maxItemsPerRun)) {
    results.push(await persistDiscoveredCandidate(client, source, candidate, options));
  }
  return results;
}

async function withSerializableRetry<T>(
  client: CorpusPersistenceClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt++) {
    try {
      return await client.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error) || attempt === MAX_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw lastError;
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === 'P2002' || code === 'P2034';
}

function normalizeExternalId(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > MAX_EXTERNAL_ID_LENGTH) {
    throw new InvalidDiscoveryCandidateError(
      `externalId exceeds ${MAX_EXTERNAL_ID_LENGTH} characters`,
    );
  }
  return normalized;
}

function cleanText(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function optionalDate(value: Date | undefined): Date | undefined {
  return value === undefined ? undefined : validDate(value, 'candidate date');
}

function validDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidDiscoveryCandidateError(`${label} must be a valid Date`);
  }
  return value;
}

function documentMetadata(
  candidate: DiscoveredDocumentCandidate,
): Prisma.InputJsonValue | undefined {
  return jsonObject({
    ...(candidate.metadata ?? {}),
    ...(candidate.authors?.length ? { authors: candidate.authors } : {}),
    ...(candidate.tags?.length ? { tags: candidate.tags } : {}),
  });
}

function occurrenceMetadata(
  candidate: DiscoveredDocumentCandidate,
): Prisma.InputJsonValue | undefined {
  return jsonObject(candidate.metadata ?? {});
}

function jsonObject(value: Record<string, unknown>): Prisma.InputJsonValue | undefined {
  if (Object.keys(value).length === 0) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    throw new InvalidDiscoveryCandidateError('Candidate metadata must be JSON serializable');
  }
}
