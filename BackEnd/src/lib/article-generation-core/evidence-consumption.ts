import { normalizeArticleSourceUrl } from '../article-source-service.js';
import type { StructuredArticleContent } from '../../types/structured-article.js';
import type {
  ArticleGenerationMode,
  EvidenceDossier,
  EvidenceItem,
  EvidenceProvenance,
  EvidenceRole,
} from './types.js';

export interface IndexedEvidenceSnapshot {
  evidenceKey: string;
  documentId: string;
  chunkId: string;
  sourceId?: string | null;
  canonicalUrl: string;
  domain: string;
  documentTitle: string;
  role: EvidenceRole;
  provenance?: EvidenceProvenance;
}

export interface EvidenceUsage {
  sourceUrls?: string[];
  documentIds?: string[];
  claimKeysByUrl?: Record<string, string[]>;
  claimKeysByDocumentId?: Record<string, string[]>;
}

export function buildIndexedEvidenceDossier(
  mode: ArticleGenerationMode,
  evidence: IndexedEvidenceSnapshot[],
): EvidenceDossier {
  const itemsByDocument = new Map<string, EvidenceItem>();
  for (const snapshot of evidence) {
    const canonicalUrl = normalizeArticleSourceUrl(snapshot.canonicalUrl);
    if (!canonicalUrl) continue;
    const existing = itemsByDocument.get(snapshot.documentId);
    if (existing) {
      if (!existing.chunkIds.includes(snapshot.chunkId)) existing.chunkIds.push(snapshot.chunkId);
      continue;
    }
    itemsByDocument.set(snapshot.documentId, {
      ingestedDocumentId: snapshot.documentId,
      chunkIds: [snapshot.chunkId],
      sourceId: snapshot.sourceId ?? null,
      canonicalUrl,
      discoveredUrls: [canonicalUrl],
      domain: snapshot.domain.trim().toLowerCase().replace(/^www\./, ''),
      title: snapshot.documentTitle,
      role: snapshot.role,
      status: 'INDEXED',
      claimKeys: [],
      provenance: snapshot.provenance ?? 'MANUAL',
      traceability: 'COMPLETE',
    });
  }
  const items = [...itemsByDocument.values()];
  return {
    mode,
    items,
    traceability: 'COMPLETE',
    degradedReasons: [],
    persistedDocuments: items.length,
    indexedDocuments: items.length,
    usedEvidenceItems: 0,
  };
}

export function evidenceEligibleForGeneration(
  item: EvidenceItem,
  mode: ArticleGenerationMode,
): boolean {
  if (mode === 'AUTO_EDITORIAL') return item.status === 'INDEXED' || item.status === 'USED';
  return ['FOUND', 'PERSISTED', 'INDEXED', 'USED'].includes(item.status);
}

export function filterSourcesByEvidenceDossier<T extends { url: string }>(
  sources: T[],
  dossier: EvidenceDossier,
): T[] {
  const eligibleUrls = new Set(dossier.items
    .filter((item) => evidenceEligibleForGeneration(item, dossier.mode))
    .flatMap((item) => [item.canonicalUrl, ...(item.discoveredUrls ?? [])])
    .map(normalizeArticleSourceUrl)
    .filter((url): url is string => Boolean(url)));
  return sources.filter((source) => {
    const url = normalizeArticleSourceUrl(source.url);
    return Boolean(url && eligibleUrls.has(url));
  });
}

export function filterIndexedSnapshotsByEvidenceDossier<T extends {
  documentId: string;
  chunkId: string;
}>(
  evidence: T[],
  dossier: EvidenceDossier,
): T[] {
  const allowedChunks = new Set(dossier.items
    .filter((item) => evidenceEligibleForGeneration(item, dossier.mode))
    .flatMap((item) => item.chunkIds.map((chunkId) => `${item.ingestedDocumentId}:${chunkId}`)));
  return evidence.filter((item) => allowedChunks.has(`${item.documentId}:${item.chunkId}`));
}

export function markEvidenceDossierUsage(
  dossier: EvidenceDossier,
  usage: EvidenceUsage,
): EvidenceDossier {
  const usedUrls = new Set((usage.sourceUrls ?? [])
    .map(normalizeArticleSourceUrl)
    .filter((url): url is string => Boolean(url)));
  const usedDocumentIds = new Set(usage.documentIds ?? []);
  let foundEvidenceUsed = false;
  let unindexedEvidenceUsed = false;
  const items = dossier.items.map((item) => {
    const matched = (item.ingestedDocumentId && usedDocumentIds.has(item.ingestedDocumentId))
      || [item.canonicalUrl, ...(item.discoveredUrls ?? [])]
        .some((url) => usedUrls.has(normalizeArticleSourceUrl(url) ?? ''));
    if (!matched) {
      return item.status === 'USED'
        ? {
            ...item,
            status: item.chunkIds.length ? 'INDEXED' as const : 'PERSISTED' as const,
            claimKeys: [],
            traceability: 'COMPLETE' as const,
          }
        : { ...item, claimKeys: [...item.claimKeys] };
    }
    const claimKeys = unique([
      ...item.claimKeys,
      ...(item.ingestedDocumentId
        ? usage.claimKeysByDocumentId?.[item.ingestedDocumentId] ?? []
        : []),
      ...[item.canonicalUrl, ...(item.discoveredUrls ?? [])].flatMap((url) =>
        usage.claimKeysByUrl?.[normalizeArticleSourceUrl(url) ?? ''] ?? []),
    ]);
    if (item.status === 'FOUND') {
      foundEvidenceUsed = true;
      return { ...item, claimKeys, traceability: 'DEGRADED' as const };
    }
    if (item.status === 'PERSISTED' || item.chunkIds.length === 0) {
      unindexedEvidenceUsed = true;
      return {
        ...item,
        status: 'USED' as const,
        claimKeys,
        traceability: 'DEGRADED' as const,
      };
    }
    return { ...item, status: 'USED' as const, claimKeys };
  });
  const degradedReasons = unique([
    ...dossier.degradedReasons.filter((reason) =>
      !['FOUND_EVIDENCE_USED_FOR_PRIVATE_DRAFT', 'USED_DOCUMENT_NOT_INDEXED'].includes(reason)),
    ...(foundEvidenceUsed ? ['FOUND_EVIDENCE_USED_FOR_PRIVATE_DRAFT'] : []),
    ...(unindexedEvidenceUsed ? ['USED_DOCUMENT_NOT_INDEXED'] : []),
  ]);
  return {
    ...dossier,
    items,
    traceability: degradedReasons.length || items.some((item) => item.traceability === 'DEGRADED')
      ? 'DEGRADED'
      : 'COMPLETE',
    degradedReasons,
    usedEvidenceItems: items.filter((item) => item.status === 'USED').length,
  };
}

export function extractStructuredArticleEvidenceUsage(
  structuredContent: StructuredArticleContent | null | undefined,
): EvidenceUsage {
  if (!structuredContent) return {};
  const urlBySourceId = new Map((structuredContent.sources ?? []).map((source) => [
    source.id,
    normalizeArticleSourceUrl(source.url),
  ]));
  const sourceUrls = new Set<string>();
  const claimKeysByUrl = new Map<string, Set<string>>();
  for (const claim of structuredContent.claims ?? []) {
    const urls = [
      ...(claim.sourceUrls ?? []),
      ...(claim.sourceIds ?? []).map((sourceId) => urlBySourceId.get(sourceId)),
    ]
      .map(normalizeArticleSourceUrl)
      .filter((url): url is string => Boolean(url));
    for (const url of urls) {
      sourceUrls.add(url);
      const keys = claimKeysByUrl.get(url) ?? new Set<string>();
      keys.add(claim.id);
      claimKeysByUrl.set(url, keys);
    }
  }
  return {
    sourceUrls: [...sourceUrls],
    claimKeysByUrl: Object.fromEntries(
      [...claimKeysByUrl].map(([url, keys]) => [url, [...keys]]),
    ),
  };
}

export function usedEvidenceUrls(dossier: EvidenceDossier): string[] {
  return dossier.items
    .filter((item) => item.status === 'USED')
    .flatMap((item) => [item.canonicalUrl, ...(item.discoveredUrls ?? [])])
    .map(normalizeArticleSourceUrl)
    .filter((url): url is string => Boolean(url));
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
