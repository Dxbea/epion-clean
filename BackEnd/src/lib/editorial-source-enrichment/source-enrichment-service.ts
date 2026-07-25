import { Prisma, type PrismaClient } from '@prisma/client';
import { processIngestedDocument, type DocumentCorpusResult } from '../document-corpus/document-corpus-service.js';
import { searchDocumentCorpus, type DocumentSearchResult } from '../document-corpus/document-rag-service.js';
import { enrichEditorialEvidenceWithSerper, type EditorialSerperEnrichmentResult } from '../editorial-verification/serper-enrichment.js';

const MAX_CORPUS_CANDIDATES = 12;

export type EditorialEnrichmentRejectionReason =
  | 'SAME_DOMAIN'
  | 'ALREADY_ATTACHED'
  | 'QUASI_DUPLICATE'
  | 'LOW_TRUST_SOURCE'
  | 'NOT_INDEXED'
  | 'ROBOTS_OR_POLICY_BLOCKED'
  | 'EXACT_DUPLICATE'
  | 'PROCESSING_FAILED';

export interface EditorialSourceEnrichmentDiagnostics {
  enrichmentStatus: 'SUFFICIENT' | 'INSUFFICIENT';
  sourcesFound: number;
  sourcesAccepted: number;
  sourcesRejected: number;
  independentDomainsBefore: number;
  independentDomainsAfter: number;
  documentsBefore: number;
  documentsAfter: number;
  independentDomains: string[];
  rejectionReasons: Array<{ documentId: string; reason: EditorialEnrichmentRejectionReason }>;
  serperQueries: Array<{ lane: string; query: string }>;
  reusedCorpusDocuments: string[];
  newlyIngestedDocuments: string[];
  evidenceDossierItems: number;
  usedEvidenceItems: number;
  persistedDocuments: number;
  indexedDocuments: number;
  degradedEvidenceReasons: string[];
}

export interface EditorialSourceEnrichmentDependencies {
  searchCorpus?: (query: string, options?: { limit?: number; similarityThreshold?: number }) => Promise<DocumentSearchResult[]>;
  enrichWithSerper?: typeof enrichEditorialEvidenceWithSerper;
  processDocument?: (documentId: string) => Promise<DocumentCorpusResult>;
}

type TopicDocument = {
  documentId: string;
  role: 'REPRESENTATIVE' | 'EVIDENCE' | 'QUASI_DUPLICATE';
  document: {
    id: string;
    domain: string;
    canonicalUrl: string;
    title: string | null;
    isIndexed: boolean;
    status: string;
    duplicateOfId: string | null;
  };
};

/**
 * Adds independent, indexable evidence to an editorial topic before its brief is frozen.
 * Corpus retrieval is deliberately attempted before Serper. Serper candidates only count
 * after the standard document-corpus pipeline has accepted and indexed them.
 */
export async function enrichEditorialTopicSources(
  client: PrismaClient,
  candidateId: string,
  input: { requiredDomains: number; maximumDocuments: number; now?: Date; promoteCandidate?: boolean },
  overrides: EditorialSourceEnrichmentDependencies = {},
): Promise<EditorialSourceEnrichmentDiagnostics> {
  const candidate = await client.editorialCandidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      rationale: true,
      topic: {
        select: {
          id: true,
          label: true,
          language: true,
          documents: {
            select: {
              documentId: true,
              role: true,
              document: { select: { id: true, domain: true, canonicalUrl: true, title: true, isIndexed: true, status: true, duplicateOfId: true } },
            },
          },
        },
      },
    },
  });
  if (!candidate) throw new Error(`Editorial candidate not found: ${candidateId}`);

  const diagnostics: EditorialSourceEnrichmentDiagnostics = {
    enrichmentStatus: 'INSUFFICIENT',
    sourcesFound: candidate.topic.documents.length,
    sourcesAccepted: 0,
    sourcesRejected: 0,
    independentDomainsBefore: independentDomains(candidate.topic.documents).length,
    independentDomainsAfter: 0,
    documentsBefore: candidate.topic.documents.length,
    documentsAfter: candidate.topic.documents.length,
    independentDomains: independentDomains(candidate.topic.documents),
    rejectionReasons: [],
    serperQueries: [],
    reusedCorpusDocuments: [],
    newlyIngestedDocuments: [],
    evidenceDossierItems: 0,
    usedEvidenceItems: 0,
    persistedDocuments: 0,
    indexedDocuments: 0,
    degradedEvidenceReasons: [],
  };
  const attached = new Set(candidate.topic.documents.map((item) => item.documentId));
  const domains = new Set(diagnostics.independentDomains);
  const attachedTitles = candidate.topic.documents.map((item) => item.document.title).filter((title): title is string => Boolean(title?.trim()));
  const capacity = Math.max(0, input.maximumDocuments - attached.size);

  const attach = async (documentId: string, domain: string, similarity: number, origin: 'CORPUS' | 'SERPER'): Promise<boolean> => {
    const normalizedDomain = normalizeDomain(domain);
    if (attached.has(documentId)) return reject(diagnostics, documentId, 'ALREADY_ATTACHED');
    if (!normalizedDomain || domains.has(normalizedDomain)) return reject(diagnostics, documentId, 'SAME_DOMAIN');
    const document = await client.ingestedDocument.findUnique({
      where: { id: documentId },
      select: { id: true, domain: true, title: true, isIndexed: true, status: true, duplicateOfId: true, robotsAllowed: true },
    });
    if (!document) return reject(diagnostics, documentId, 'PROCESSING_FAILED');
    if (document.duplicateOfId) return reject(diagnostics, documentId, 'EXACT_DUPLICATE');
    const knownSource = await client.source.findUnique({
      where: { domain: normalizeDomain(document.domain) },
      select: { trustScore: true, hasFactCheckFailures: true },
    });
    if (knownSource && (knownSource.hasFactCheckFailures || knownSource.trustScore < 35)) {
      return reject(diagnostics, documentId, 'LOW_TRUST_SOURCE');
    }
    if (document.title && attachedTitles.some((title) => nearDuplicateTitle(document.title!, title))) {
      return reject(diagnostics, documentId, 'QUASI_DUPLICATE');
    }
    if (!document.isIndexed || document.status !== 'INDEXED') {
      const process = overrides.processDocument ?? ((id: string) => processIngestedDocument({ client }, id));
      try {
        const result = await process(documentId);
        if (result.outcome === 'DUPLICATE') return reject(diagnostics, documentId, 'EXACT_DUPLICATE');
        if (result.outcome === 'BLOCKED') return reject(diagnostics, documentId, 'ROBOTS_OR_POLICY_BLOCKED');
      } catch {
        return reject(diagnostics, documentId, document.robotsAllowed === false ? 'ROBOTS_OR_POLICY_BLOCKED' : 'PROCESSING_FAILED');
      }
    }
    const refreshed = await client.ingestedDocument.findUnique({
      where: { id: documentId },
      select: { id: true, domain: true, title: true, isIndexed: true, status: true, duplicateOfId: true },
    });
    if (!refreshed?.isIndexed || refreshed.status !== 'INDEXED') return reject(diagnostics, documentId, 'NOT_INDEXED');
    if (refreshed.duplicateOfId) return reject(diagnostics, documentId, 'EXACT_DUPLICATE');
    const refreshedDomain = normalizeDomain(refreshed.domain);
    if (!refreshedDomain || domains.has(refreshedDomain)) return reject(diagnostics, documentId, 'SAME_DOMAIN');
    await client.editorialTopicDocument.upsert({
      where: { topicId_documentId: { topicId: candidate.topic.id, documentId } },
      create: { topicId: candidate.topic.id, documentId, role: 'EVIDENCE', similarityToCentroid: similarity, eventAt: input.now ?? new Date() },
      update: { role: 'EVIDENCE', similarityToCentroid: similarity },
    });
    attached.add(documentId);
    domains.add(refreshedDomain);
    if (refreshed.title) attachedTitles.push(refreshed.title);
    diagnostics.sourcesAccepted++;
    if (origin === 'CORPUS') diagnostics.reusedCorpusDocuments.push(documentId);
    else diagnostics.newlyIngestedDocuments.push(documentId);
    return true;
  };

  if (capacity > 0 && domains.size < input.requiredDomains) {
    const searchCorpus = overrides.searchCorpus ?? ((query, options) => searchDocumentCorpus(client, query, options));
    // Vector retrieval is an optimisation, never a reason to skip the web fallback.
    const corpus = await searchCorpus(candidate.topic.label, {
      limit: Math.min(MAX_CORPUS_CANDIDATES, capacity * 3), similarityThreshold: 0.55,
    }).catch(() => []);
    diagnostics.sourcesFound += corpus.length;
    for (const result of corpus) {
      if (domains.size >= input.requiredDomains || attached.size >= input.maximumDocuments) break;
      await attach(result.documentId, result.domain, result.similarity, 'CORPUS');
    }
  }

  if (domains.size < input.requiredDomains && attached.size < input.maximumDocuments) {
    const enrichWithSerper = overrides.enrichWithSerper ?? enrichEditorialEvidenceWithSerper;
    const existingEvidence = candidate.topic.documents.map((item, index) => ({
      evidenceKey: `topic_${item.documentId}`,
      documentId: item.documentId,
      sourceId: null,
      url: item.document.canonicalUrl,
      title: item.document.canonicalUrl,
      domain: item.document.domain,
      content: '',
      publishedAt: null,
      lane: index === 0 ? 'PRIMARY' as const : 'CONTEXT' as const,
      origin: 'CORPUS' as const,
      extractionStatus: 'full' as const,
    }));
    const serper: EditorialSerperEnrichmentResult = await enrichWithSerper(client, {
      topic: candidate.topic.label,
      reasons: ['INSUFFICIENT_DOMAIN_DIVERSITY'],
      existingEvidence,
      language: candidate.topic.language,
      now: input.now,
    });
    diagnostics.serperQueries = serper.queries.map((item) => ({ lane: item.lane, query: item.query }));
    const dossier = serper.dossier;
    if (dossier) {
      diagnostics.evidenceDossierItems += dossier.items.length;
      diagnostics.usedEvidenceItems += dossier.usedEvidenceItems;
      diagnostics.persistedDocuments += dossier.persistedDocuments;
      diagnostics.indexedDocuments += dossier.indexedDocuments;
      diagnostics.degradedEvidenceReasons.push(...dossier.degradedReasons);
    }
    diagnostics.sourcesFound += serper.evidence.length;
    for (const evidence of serper.evidence) {
      if (domains.size >= input.requiredDomains || attached.size >= input.maximumDocuments) break;
      await attach(evidence.documentId, evidence.domain, 0.55, 'SERPER');
    }
  }

  diagnostics.independentDomains = [...domains].sort();
  diagnostics.independentDomainsAfter = diagnostics.independentDomains.length;
  diagnostics.documentsAfter = attached.size;
  diagnostics.sourcesRejected = diagnostics.rejectionReasons.length;
  diagnostics.enrichmentStatus = domains.size >= input.requiredDomains ? 'SUFFICIENT' : 'INSUFFICIENT';
  await client.editorialTopic.update({
    where: { id: candidate.topic.id },
    data: { independentDomainCount: domains.size, documentCount: attached.size },
  });
  await client.editorialCandidate.update({
    where: { id: candidateId },
    data: {
      rationale: mergeEnrichmentRationale(candidate.rationale, diagnostics),
    },
  });
  if (diagnostics.enrichmentStatus === 'SUFFICIENT' && input.promoteCandidate !== false) {
    await client.editorialCandidate.update({ where: { id: candidateId }, data: { status: 'SHADOW_PROPOSED' } });
  }
  return diagnostics;
}

function mergeEnrichmentRationale(
  rationale: Prisma.JsonValue | null | undefined,
  enrichment: EditorialSourceEnrichmentDiagnostics,
): Prisma.InputJsonValue {
  const base = rationale && typeof rationale === 'object' && !Array.isArray(rationale)
    ? rationale as Record<string, Prisma.JsonValue>
    : {};
  return { ...base, enrichment: enrichment as unknown as Prisma.InputJsonValue };
}

function reject(
  diagnostics: EditorialSourceEnrichmentDiagnostics,
  documentId: string,
  reason: EditorialEnrichmentRejectionReason,
): false {
  diagnostics.rejectionReasons.push({ documentId, reason });
  return false;
}

function independentDomains(documents: TopicDocument[]): string[] {
  return [...new Set(documents
    .filter((item) => item.role !== 'QUASI_DUPLICATE' && !item.document.duplicateOfId)
    .map((item) => normalizeDomain(item.document.domain))
    .filter(Boolean))].sort();
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '');
}

function nearDuplicateTitle(left: string, right: string): boolean {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (leftTokens.size < 4 || rightTokens.size < 4) return false;
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap++;
  return overlap / Math.max(leftTokens.size, rightTokens.size) >= 0.9;
}

function titleTokens(value: string): Set<string> {
  return new Set(value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter((token) => token.length >= 4));
}
