import type { Prisma, PrismaClient } from '@prisma/client';
import { normalizeArticleSourceUrl } from '../article-source-service.js';
import type {
  ArticleGenerationMode,
  EvidenceDossier,
  EvidenceItem,
  EvidenceProvenance,
  EvidenceRole,
} from './types.js';

export interface FoundEvidence {
  url: string;
  title?: string | null;
  role?: EvidenceRole;
  provenance: EvidenceProvenance;
}

export interface BuildEvidenceDossierInput {
  mode: ArticleGenerationMode;
  documentIds: string[];
  usedDocumentIds?: string[];
  foundEvidence?: FoundEvidence[];
  rolesByDocumentId?: Record<string, EvidenceRole>;
  claimKeysByDocumentId?: Record<string, string[]>;
}

export async function buildEvidenceDossier(
  client: PrismaClient,
  input: BuildEvidenceDossierInput,
): Promise<EvidenceDossier> {
  const documentIds = [...new Set(input.documentIds.filter(Boolean))];
  const usedDocumentIds = new Set(input.usedDocumentIds ?? []);
  const documents = documentIds.length === 0
    ? []
    : await client.ingestedDocument.findMany({
        where: { id: { in: documentIds } },
        select: {
          id: true,
          canonicalUrl: true,
          domain: true,
          title: true,
          sourceId: true,
          status: true,
          isIndexed: true,
          chunks: { select: { id: true }, orderBy: { position: 'asc' } },
          discoveries: {
            select: {
              discoveredUrl: true,
              metadata: true,
              discoverySource: {
                select: {
                  key: true,
                  connectorType: true,
                  configuration: true,
                },
              },
            },
            orderBy: { lastSeenAt: 'desc' },
          },
        },
      });

  const persistedUrls = new Set(documents.map((document) => document.canonicalUrl));
  const items: EvidenceItem[] = documents.map((document) => {
    const chunkIds = document.chunks.map((chunk) => chunk.id);
    const used = usedDocumentIds.has(document.id);
    const indexed = document.status === 'INDEXED' && document.isIndexed && chunkIds.length > 0;
    const degraded = used && !indexed;
    return {
      ingestedDocumentId: document.id,
      chunkIds,
      sourceId: document.sourceId,
      canonicalUrl: document.canonicalUrl,
      discoveredUrls: uniqueStrings(document.discoveries
        .map((discovery) => normalizeArticleSourceUrl(discovery.discoveredUrl))
        .filter((url): url is string => Boolean(url))),
      domain: document.domain,
      title: document.title,
      role: input.rolesByDocumentId?.[document.id] ?? 'CONTEXT',
      status: used ? 'USED' : indexed ? 'INDEXED' : 'PERSISTED',
      claimKeys: uniqueStrings(input.claimKeysByDocumentId?.[document.id] ?? []),
      provenance: resolveEvidenceProvenance(document.discoveries),
      traceability: degraded ? 'DEGRADED' : 'COMPLETE',
    };
  });

  for (const found of input.foundEvidence ?? []) {
    const canonicalUrl = normalizeArticleSourceUrl(found.url);
    if (!canonicalUrl || persistedUrls.has(canonicalUrl)) continue;
    items.push({
      ingestedDocumentId: null,
      chunkIds: [],
      sourceId: null,
      canonicalUrl,
      discoveredUrls: [canonicalUrl],
      domain: new URL(canonicalUrl).hostname.toLowerCase().replace(/^www\./, ''),
      title: found.title ?? null,
      role: found.role ?? 'CONTEXT',
      status: 'FOUND',
      claimKeys: [],
      provenance: found.provenance,
      traceability: 'DEGRADED',
    });
  }

  const missingDocumentIds = documentIds.filter((id) =>
    !documents.some((document) => document.id === id));
  const degradedReasons = [
    ...(items.some((item) => item.status === 'FOUND') ? ['FOUND_NOT_PERSISTED'] : []),
    ...(items.some((item) => item.status === 'USED' && item.chunkIds.length === 0)
      ? ['USED_DOCUMENT_NOT_INDEXED']
      : []),
    ...(missingDocumentIds.length > 0
      ? [`DOCUMENTS_NOT_FOUND:${missingDocumentIds.join(',')}`]
      : []),
  ];

  return {
    mode: input.mode,
    items,
    traceability: degradedReasons.length === 0 ? 'COMPLETE' : 'DEGRADED',
    degradedReasons,
    persistedDocuments: items.filter((item) => item.ingestedDocumentId).length,
    indexedDocuments: items.filter((item) =>
      item.ingestedDocumentId && item.chunkIds.length > 0).length,
    usedEvidenceItems: items.filter((item) => item.status === 'USED').length,
  };
}

export type EvidenceDiscoveryRow = {
  discoveredUrl: string;
  metadata: Prisma.JsonValue | null;
  discoverySource: {
    key: string;
    connectorType: string;
    configuration: Prisma.JsonValue | null;
  };
};

export function resolveEvidenceProvenance(
  discoveries: EvidenceDiscoveryRow[],
): EvidenceProvenance {
  for (const discovery of discoveries) {
    const metadata = jsonRecord(discovery.metadata);
    const configuration = jsonRecord(discovery.discoverySource.configuration);
    const provider = stringValue(metadata.provider) ?? stringValue(configuration.provider);
    if (provider === 'serper') return 'SERPER';
    if (provider === 'gdelt') return 'GDELT';
    if (provider === 'google_news_rss') return 'GOOGLE_NEWS_RSS';
    const connectorType = discovery.discoverySource.connectorType;
    if (connectorType === 'RSS') return 'RSS';
    if (connectorType === 'ATOM') return 'ATOM';
    if (connectorType === 'SITEMAP' || connectorType === 'SITEMAP_INDEX') return 'SITEMAP';
    if (connectorType === 'GDELT') return 'GDELT';
    if (connectorType === 'GOOGLE_NEWS_RSS') return 'GOOGLE_NEWS_RSS';
  }
  return 'MANUAL';
}

function jsonRecord(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function stringValue(value: Prisma.JsonValue | undefined): string | null {
  return typeof value === 'string' ? value.toLowerCase() : null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
