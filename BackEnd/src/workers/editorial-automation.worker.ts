import { fileURLToPath } from 'node:url';
import { type ConnectionOptions } from 'bullmq';
import { prisma } from '../lib/db.js';
import { createDiscoveryQueues, buildDiscoveryJobId, DISCOVERY_JOB_NAME } from '../lib/discovery/discovery-queue.js';
import { createDocumentQueues, enqueueDocumentJob } from '../lib/document-corpus/document-queue.js';
import { DOCUMENT_EMBEDDING_MODEL } from '../lib/document-corpus/document-rag-service.js';
import { createEditorialShadowQueues, enqueueEditorialShadowJob, prepareEditorialShadowJob } from '../lib/editorial-shadow/editorial-queue.js';
import { DEFAULT_EDITORIAL_CLUSTERING_CONFIG } from '../lib/editorial-shadow/types.js';
import { createEditorialBriefQueues, enqueueEditorialBriefJob, prepareEditorialBriefJob } from '../lib/editorial-brief/brief-queue.js';
import { DEFAULT_EDITORIAL_BRIEF_CONFIG } from '../lib/editorial-brief/types.js';
import { createEditorialDraftQueues, enqueueEditorialDraftJob, prepareEditorialDraftJob } from '../lib/editorial-draft/draft-queue.js';
import { createEditorialVerificationQueues, createEditorialVerificationRedisConnection, enqueueEditorialVerificationJob, prepareEditorialVerificationJob } from '../lib/editorial-verification/verification-queue.js';
import { isRedisKillSwitchActive, type DiscoveryRedis } from '../lib/discovery/redis-lock.js';
import { logger } from '../lib/logger.js';
import { EDITORIAL_AUTOMATION_REDIS_KILL_SWITCH_KEY, resolveEditorialVerificationRuntimeFlags, type EditorialVerificationRuntimeFlags } from '../lib/editorial-verification/runtime-flags.js';

const workerLog = logger.child({ module: 'EditorialAutomationWorker' });
const DOCUMENT_REVISION = 'editorial-automation-v1';

export function editorialAutomationWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { windowStart: start, windowEnd: new Date(start.getTime() + 24 * 60 * 60_000) };
}

export interface EditorialAutomationReport {
  discoveryJobsStarted: number;
  documentsDiscovered: number;
  documentsAlreadyIndexed: number;
  documentsIndexedThisRun: number;
  documentsEligibleForClustering: number;
  eligibleDocuments: Array<{ id: string; title: string | null; domain: string; sourceId: string | null; sourceKey: string | null; categoryId: string | null; status: string; isIndexed: boolean; indexedAt: Date | null; updatedAt: Date }>;
  eligibleDomains: string[];
  eligibleSourceKeys: string[];
  minimumDomainsRequired: number;
  minimumSourcesRequired: number;
  clusterInputDocumentIds: string[];
  clusterBlockages: Array<{ code: string; detail: Record<string, unknown> }>;
  existingRun: { id: string; status: string; completedAt: Date | null; updatedAt: Date; informational: boolean } | null;
  documentsQueuedForIndexing: number;
  documentsIndexed: number;
  documentsBlocked: Array<{ documentId: string; reason: string }>;
  clusters: number;
  clusterOutcomes: EditorialClusterOutcome[];
  briefBlockages: Array<{ code: string; detail: Record<string, unknown> }>;
  briefs: number;
  drafts: number;
  verifications: number;
  publications: number;
  blockages: string[];
  discoveredByLowCost: number;
  discoveredByGdelt: number;
  discoveredByGoogleNews: number;
  discoveredBySerper: number;
  persistedDocuments: number;
  queuedForCorpus: number;
  indexedDocuments: number;
  evidenceDossierItems: number;
  usedEvidenceItems: number;
  degradedEvidenceReasons: string[];
  initialDomains: number;
  initialDocuments: number;
  sourcePoorInitialClusters: number;
  enrichmentAttempted: boolean;
  enrichmentSources: number;
  enrichmentPersistedDocuments: number;
  enrichmentIndexedDocuments: number;
  finalEligibleDomains: number;
  finalEligibleDocuments: number;
  finalBlockage: string | null;
  publicationBlockedReason: string | null;
}

export interface EditorialClusterOutcome {
  runId: string;
  runStatus: string;
  topicId: string;
  clusterKey: string;
  label: string;
  status: 'proposed' | 'suppressed' | 'skipped';
  candidateId: string | null;
  candidateStatus: string | null;
  editorialScore: number | null;
  proposalMinimumEditorialScore: number;
  riskLevel: string | null;
  domains: string[];
  domainCount: number;
  documents: Array<{ id: string; role: string; domain: string; sourceId: string | null }>;
  documentCount: number;
  evidenceDocumentCount: number;
  sources: string[];
  sourceCount: number;
  suppressionReasons: string[];
  dossiers: Array<{ id: string; status: string; briefId: string | null }>;
  briefMinimumEditorialScore: number;
  briefRequiredDomains: number;
  briefDisposition: 'eligible' | 'suppressed' | 'skipped' | 'already_processed';
  briefReasons: string[];
}

export async function runEditorialAutomationTick(
  flags: EditorialVerificationRuntimeFlags,
  queues: any,
  now = new Date(),
  options: { indexedLookbackHours?: number; documentsIndexedThisRun?: number } = {},
): Promise<EditorialAutomationReport> {
  if (!flags.automationSourceKeys.length) throw new Error('EDITORIAL_AUTOMATION_SOURCE_KEYS is required when automation is enabled');
  const { windowStart, windowEnd } = editorialAutomationWindow(now);
  const sources = await prisma.discoverySource.findMany({
    where: { key: { in: flags.automationSourceKeys }, enabled: true, disabledReason: null, accessPolicy: { not: 'BLOCKED' } },
    select: { id: true, key: true, sourceId: true, categoryId: true, connectorType: true },
  });
  if (sources.length !== flags.automationSourceKeys.length) throw new Error('Configured editorial automation sources must exist, be enabled and not blocked');
  const durableSourceIds = sources.map((source) => source.sourceId).filter((sourceId): sourceId is string => Boolean(sourceId));
  if (durableSourceIds.length !== sources.length) throw new Error('Configured editorial automation sources require a durable DiscoverySource.sourceId');
  const indexedLookbackHours = options.indexedLookbackHours ?? flags.automationIndexedLookbackHours;
  const selectionStart = new Date(now.getTime() - indexedLookbackHours * 60 * 60_000);
  const scopedDocuments = await prisma.ingestedDocument.findMany({
    where: { sourceId: { in: durableSourceIds }, discoveredAt: { gte: selectionStart, lte: now } },
    select: { id: true, title: true, domain: true, sourceId: true, status: true, isIndexed: true, indexedAt: true, updatedAt: true, robotsAllowed: true, accessPolicy: true, storagePolicy: true },
  });
  const blocked = scopedDocuments.filter((document) => document.robotsAllowed === false || document.accessPolicy === 'BLOCKED' || document.accessPolicy === 'METADATA_ONLY' || document.storagePolicy === 'NONE' || document.storagePolicy === 'METADATA_ONLY')
    .map((document) => ({ documentId: document.id, reason: document.robotsAllowed === false ? 'ROBOTS_DISALLOWED' : document.accessPolicy === 'BLOCKED' ? 'ACCESS_POLICY_BLOCKED' : document.accessPolicy === 'METADATA_ONLY' ? 'ACCESS_POLICY_METADATA_ONLY' : document.storagePolicy === 'NONE' ? 'STORAGE_POLICY_NONE' : 'STORAGE_POLICY_METADATA_ONLY' }));
  for (const source of sources) {
    await queues.discoveryQueue.add(DISCOVERY_JOB_NAME, { discoverySourceId: source.id, scheduledFor: windowStart.toISOString(), trigger: 'SCHEDULER' }, { jobId: buildDiscoveryJobId(source.id, windowStart) });
  }
  const documents = scopedDocuments.filter((document) => document.status === 'DISCOVERED' && !document.isIndexed && document.robotsAllowed !== false && !blocked.some((item) => item.documentId === document.id)).slice(0, flags.automationMaximumDocuments);
  for (const document of documents) await enqueueDocumentJob(queues.documentQueue, { documentId: document.id, revision: DOCUMENT_REVISION, requestedAt: now.toISOString(), trigger: 'DISCOVERY' });

  const indexed = await prisma.ingestedDocument.findMany({
    where: { sourceId: { in: durableSourceIds }, discoveredAt: { gte: selectionStart, lte: now }, isIndexed: true, status: 'INDEXED' },
    orderBy: { discoveredAt: 'asc' }, take: flags.automationMaximumDocuments, select: { id: true, title: true, domain: true, sourceId: true, status: true, isIndexed: true, indexedAt: true, updatedAt: true },
  });
  const sourceById = new Map(sources.filter((source) => source.sourceId).map((source) => [source.sourceId!, source]));
  const indexedDomains = new Set(indexed.map((document) => document.domain.toLowerCase()));
  const initialClusterInputDocumentIds = indexed.map((document) => document.id).sort();
  const initialClusterJob = initialClusterInputDocumentIds.length >= 2
    ? prepareEditorialShadowJob({ windowStart, windowEnd, embeddingModel: DOCUMENT_EMBEDDING_MODEL, documentIds: initialClusterInputDocumentIds, trigger: 'SCHEDULED', requestedAt: now, config: { maxDocuments: flags.automationMaximumDocuments, minProposalDocuments: 2, minProposalDomains: 2 } })
    : null;
  const candidateDiagnostics = await prisma.editorialCandidate.findMany({
    where: { topic: { run: { windowStart, windowEnd } } },
    select: {
      rationale: true,
      topic: {
        select: {
          independentDomainCount: true,
          documentCount: true,
          run: { select: { idempotencyKey: true } },
          documents: {
            select: {
              documentId: true,
              role: true,
              document: {
                select: { domain: true, status: true, isIndexed: true },
              },
            },
          },
        },
      },
      sourceDossiers: {
        select: {
          selectedChunkCount: true,
          brief: { select: { id: true } },
        },
      },
    },
  });
  const enrichmentDiagnostics = candidateDiagnostics
    .map((item) => jsonRecord(jsonRecord(item.rationale).enrichment))
    .filter((item) => Object.keys(item).length > 0);
  const enrichedIndexedDocuments = candidateDiagnostics
    .filter((item) =>
      initialClusterJob
      && item.topic.run?.idempotencyKey === initialClusterJob.idempotencyKey)
    .flatMap((item) =>
    (item.topic.documents ?? []).filter((topicDocument) =>
      topicDocument.role !== 'QUASI_DUPLICATE'
      && topicDocument.document.status === 'INDEXED'
      && topicDocument.document.isIndexed));
  const clusterInputDocumentIds = [...new Set([
    ...initialClusterInputDocumentIds,
    ...enrichedIndexedDocuments.map((item) => item.documentId),
  ])].sort();
  const finalCorpusDomains = new Set([
    ...indexedDomains,
    ...enrichedIndexedDocuments.map((item) => item.document.domain.toLowerCase()),
  ]);
  const sourcePoorInitialCluster = indexed.length >= 2 && indexedDomains.size < 2;
  const clusterJob = clusterInputDocumentIds.length >= 2
    ? prepareEditorialShadowJob({ windowStart, windowEnd, embeddingModel: DOCUMENT_EMBEDDING_MODEL, documentIds: clusterInputDocumentIds, trigger: 'SCHEDULED', requestedAt: now, config: { maxDocuments: flags.automationMaximumDocuments, minProposalDocuments: 2, minProposalDomains: 2 } })
    : null;
  const existingRun = clusterJob
    ? await prisma.editorialRun.findUnique({ where: { idempotencyKey: clusterJob.idempotencyKey }, select: { id: true, status: true, completedAt: true, updatedAt: true } })
    : null;
  let clustered = false;
  if (!existingRun && clusterJob) {
    await enqueueEditorialShadowJob(queues.editorialQueue, clusterJob);
    clustered = true;
  }
  const candidate = await prisma.editorialCandidate.findFirst({
    where: { status: 'SHADOW_PROPOSED', sourceDossiers: { none: {} }, topic: { run: { windowStart, windowEnd, status: 'COMPLETED' } } },
    select: { topic: { select: { runId: true } } }, orderBy: { editorialScore: 'desc' },
  });
  let brief = false;
  if (candidate) { await enqueueEditorialBriefJob(queues.briefQueue, prepareEditorialBriefJob({ editorialRunId: candidate.topic.runId, config: { maximumCandidates: 1 }, trigger: 'AUTOMATION', requestedAt: now })); brief = true; }
  const readyBrief = await prisma.editorialBrief.findFirst({ where: { drafts: { none: {} }, dossier: { candidate: { topic: { run: { windowStart, windowEnd, status: 'COMPLETED' } } } } }, select: { id: true }, orderBy: { generatedAt: 'asc' } });
  let draft = false;
  if (readyBrief) { await enqueueEditorialDraftJob(queues.draftQueue, prepareEditorialDraftJob({ briefId: readyBrief.id, trigger: 'AUTOMATION', requestedAt: now })); draft = true; }
  const readyDraft = await prisma.editorialDraft.findFirst({ where: { status: 'ARTICLE_DRAFT_CREATED', article: { is: { status: 'DRAFT' } }, verificationRuns: { none: {} }, brief: { dossier: { candidate: { topic: { run: { windowStart, windowEnd, status: 'COMPLETED' } } } } } }, select: { id: true, currentRevisionId: true, contentHash: true }, orderBy: { createdAt: 'asc' } });
  let verification = false;
  if (readyDraft?.currentRevisionId && readyDraft.contentHash) { await enqueueEditorialVerificationJob(queues.verificationQueue, prepareEditorialVerificationJob({ draftId: readyDraft.id, revisionId: readyDraft.currentRevisionId, expectedContentHash: readyDraft.contentHash, trigger: 'AUTOMATION', requestedAt: now })); verification = true; }
  const topicDiagnostics = await prisma.editorialTopic.findMany({
    where: { run: { windowStart, windowEnd } },
    select: {
      id: true,
      runId: true,
      clusterKey: true,
      label: true,
      documentCount: true,
      independentDomainCount: true,
      run: { select: { status: true } },
      documents: {
        select: {
          documentId: true,
          role: true,
          document: { select: { domain: true, sourceId: true } },
        },
      },
      candidate: {
        select: {
          id: true,
          status: true,
          editorialScore: true,
          riskLevel: true,
          rationale: true,
          sourceDossiers: {
            select: {
              id: true,
              status: true,
              brief: { select: { id: true } },
            },
          },
        },
      },
    },
    orderBy: [{ run: { createdAt: 'asc' } }, { createdAt: 'asc' }],
  });
  const clusterOutcomes = topicDiagnostics.map((topic): EditorialClusterOutcome => {
    const evidenceDocuments = topic.documents.filter((document) => document.role !== 'QUASI_DUPLICATE');
    const domains = [...new Set(evidenceDocuments.map((document) =>
      document.document.domain.toLowerCase()))].sort();
    const sources = [...new Set(evidenceDocuments.map((document) =>
      document.document.sourceId ?? `domain:${document.document.domain.toLowerCase()}`))].sort();
    const reasons = jsonStringArray(jsonRecord(topic.candidate?.rationale).reasons);
    const requiredDomains = topic.candidate?.riskLevel === 'HIGH'
      ? DEFAULT_EDITORIAL_BRIEF_CONFIG.highRiskMinimumDomains
      : DEFAULT_EDITORIAL_BRIEF_CONFIG.minimumDomains;
    const dossiers = (topic.candidate?.sourceDossiers ?? []).map((dossier) => ({
      id: dossier.id,
      status: dossier.status,
      briefId: dossier.brief?.id ?? null,
    }));
    const briefReasons = !topic.candidate
      ? ['candidate_not_created']
      : topic.candidate.status !== 'SHADOW_PROPOSED'
        ? (reasons.length > 0 ? reasons : ['candidate_suppressed'])
        : [
            ...(topic.candidate.editorialScore < DEFAULT_EDITORIAL_BRIEF_CONFIG.minimumEditorialScore
              ? ['editorial_score_below_brief_threshold']
              : []),
            ...(domains.length < requiredDomains
              ? ['insufficient_domains_for_brief']
              : []),
            ...(dossiers.length > 0
              ? [dossiers.some((dossier) => dossier.briefId)
                  ? 'brief_already_exists'
                  : `source_dossier_already_exists:${[...new Set(dossiers.map((dossier) =>
                      dossier.status.toLowerCase()))].sort().join(',')}`]
              : []),
          ];
    const status = !topic.candidate
      ? 'skipped'
      : topic.candidate.status === 'SHADOW_PROPOSED'
        ? 'proposed'
        : 'suppressed';
    const briefDisposition = !topic.candidate
      ? 'skipped'
      : topic.candidate.status !== 'SHADOW_PROPOSED'
        ? 'suppressed'
        : topic.candidate.sourceDossiers.length > 0
          ? 'already_processed'
          : briefReasons.length > 0
            ? 'skipped'
            : 'eligible';
    return {
      runId: topic.runId,
      runStatus: topic.run.status,
      topicId: topic.id,
      clusterKey: topic.clusterKey,
      label: topic.label,
      status,
      candidateId: topic.candidate?.id ?? null,
      candidateStatus: topic.candidate?.status ?? null,
      editorialScore: topic.candidate?.editorialScore ?? null,
      proposalMinimumEditorialScore: DEFAULT_EDITORIAL_CLUSTERING_CONFIG.proposalScoreThreshold,
      riskLevel: topic.candidate?.riskLevel ?? null,
      domains,
      domainCount: topic.independentDomainCount,
      documents: topic.documents.map((document) => ({
        id: document.documentId,
        role: document.role,
        domain: document.document.domain,
        sourceId: document.document.sourceId,
      })),
      documentCount: topic.documentCount,
      evidenceDocumentCount: evidenceDocuments.length,
      sources,
      sourceCount: sources.length,
      suppressionReasons: status === 'suppressed' ? reasons : [],
      dossiers,
      briefMinimumEditorialScore: DEFAULT_EDITORIAL_BRIEF_CONFIG.minimumEditorialScore,
      briefRequiredDomains: requiredDomains,
      briefDisposition,
      briefReasons,
    };
  });
  const briefBlockages = buildBriefBlockages({
    briefQueued: brief,
    clustered,
    existingRun,
    clusterOutcomes,
  });
  const degradedEvidenceReasons = [...new Set([
    ...candidateDiagnostics.flatMap((item) => {
    const reasons = jsonRecord(item.rationale).reasons;
    return Array.isArray(reasons)
      ? reasons.filter((reason): reason is string => typeof reason === 'string')
      : [];
    }),
    ...uniqueJsonStrings(enrichmentDiagnostics, 'degradedEvidenceReasons'),
  ])].sort();
  const evidenceDossierItems = candidateDiagnostics.reduce((total, item) =>
    total + item.sourceDossiers.reduce((sum, dossier) => sum + dossier.selectedChunkCount, 0), 0)
    + sumNumeric(enrichmentDiagnostics, 'evidenceDossierItems');
  const usedEvidenceItems = candidateDiagnostics.reduce((total, item) =>
    total + item.sourceDossiers.reduce((sum, dossier) =>
      sum + (dossier.brief ? dossier.selectedChunkCount : 0), 0), 0)
    + sumNumeric(enrichmentDiagnostics, 'usedEvidenceItems');
  const finalEligibleDomains = Math.max(
    finalCorpusDomains.size,
    ...candidateDiagnostics.map((item) => item.topic.independentDomainCount),
  );
  const finalEligibleDocuments = Math.max(
    clusterInputDocumentIds.length,
    ...candidateDiagnostics.map((item) => item.topic.documentCount),
  );
  const enrichmentAttempted = enrichmentDiagnostics.length > 0;
  const enrichmentSources = sumNumeric(enrichmentDiagnostics, 'sourcesAccepted');
  const enrichmentPersistedDocuments = Math.max(
    uniqueJsonStrings(enrichmentDiagnostics, 'newlyIngestedDocuments').length,
    sumNumeric(enrichmentDiagnostics, 'persistedDocuments'),
  );
  const enrichmentIndexedDocuments = Math.max(
    enrichmentSources,
    sumNumeric(enrichmentDiagnostics, 'indexedDocuments'),
  );
  const finalBlockage = enrichmentAttempted
    && (finalEligibleDomains < 2 || finalEligibleDocuments < 2)
    ? 'ENRICHMENT_INSUFFICIENT'
    : null;
  const clusterBlockages = [
    ...(indexed.length === 0 ? [{ code: 'NO_CLUSTERABLE_DOCUMENTS', detail: { documents: [] } }] : []),
    ...(indexed.length > 0 && indexed.length < 2 ? [{ code: 'NOT_ENOUGH_CLUSTERABLE_DOCUMENTS', detail: { present: indexed.length, required: 2, documentIds: clusterInputDocumentIds } }] : []),
    ...(sourcePoorInitialCluster ? [{ code: 'SOURCE_POOR_INITIAL_CLUSTER', detail: { informational: true, presentDomains: [...indexedDomains].sort(), present: indexedDomains.size, required: 2, documentIds: initialClusterInputDocumentIds } }] : []),
    ...(existingRun ? [{ code: existingRun.status === 'COMPLETED' ? 'RUN_SKIPPED_ALREADY_COMPLETED' : `RUN_ALREADY_${existingRun.status}`, detail: { runId: existingRun.id, status: existingRun.status, completedAt: existingRun.completedAt, updatedAt: existingRun.updatedAt, informational: existingRun.status === 'COMPLETED' } }] : []),
  ];
  const blockages = [
    ...(sources.filter((source) => !source.categoryId).map((source) => `MISSING_CATEGORY:${source.key}`)),
    ...clusterBlockages
      .filter((blockage) => jsonRecord(blockage.detail).informational !== true)
      .map((blockage) => blockage.code),
  ];
  const publications = await prisma.editorialReviewAuditLog.count({
    where: { action: 'ARTICLE_PUBLISHED', operationKey: { startsWith: 'editorial-autopublish:' }, createdAt: { gte: windowStart, lt: windowEnd } },
  });
  return {
    discoveryJobsStarted: sources.length,
    documentsDiscovered: scopedDocuments.filter((document) => document.status === 'DISCOVERED').length,
    documentsAlreadyIndexed: scopedDocuments.filter((document) => document.isIndexed).length,
    documentsIndexedThisRun: options.documentsIndexedThisRun ?? 0,
    documentsEligibleForClustering: indexed.length,
    eligibleDocuments: indexed.map((document) => ({ ...document, sourceKey: sourceById.get(document.sourceId ?? '')?.key ?? null, categoryId: sourceById.get(document.sourceId ?? '')?.categoryId ?? null })),
    eligibleDomains: [...indexedDomains].sort(),
    eligibleSourceKeys: [...new Set(indexed.map((document) => sourceById.get(document.sourceId ?? '')?.key).filter((key): key is string => Boolean(key)))].sort(),
    minimumDomainsRequired: 2,
    minimumSourcesRequired: 2,
    clusterInputDocumentIds,
    clusterBlockages,
    existingRun: existingRun ? { ...existingRun, informational: existingRun.status === 'COMPLETED' } : null,
    documentsQueuedForIndexing: documents.length,
    documentsIndexed: indexed.length,
    documentsBlocked: blocked,
    clusters: clustered ? 1 : 0,
    clusterOutcomes,
    briefBlockages,
    briefs: brief ? 1 : 0,
    drafts: draft ? 1 : 0,
    verifications: verification ? 1 : 0,
    publications,
    blockages,
    discoveredByLowCost: scopedDocuments.filter((document) => {
      const type = sourceById.get(document.sourceId ?? '')?.connectorType;
      return type !== 'GDELT' && type !== 'GOOGLE_NEWS_RSS'
        && sourceById.get(document.sourceId ?? '')?.key !== 'internal-editorial-serper';
    }).length,
    discoveredByGdelt: scopedDocuments.filter((document) =>
      sourceById.get(document.sourceId ?? '')?.connectorType === 'GDELT').length,
    discoveredByGoogleNews: scopedDocuments.filter((document) =>
      sourceById.get(document.sourceId ?? '')?.connectorType === 'GOOGLE_NEWS_RSS').length,
    discoveredBySerper: scopedDocuments.filter((document) =>
      sourceById.get(document.sourceId ?? '')?.key === 'internal-editorial-serper').length,
    persistedDocuments: scopedDocuments.length + enrichmentPersistedDocuments,
    queuedForCorpus: documents.length,
    indexedDocuments: indexed.length + enrichmentIndexedDocuments,
    evidenceDossierItems,
    usedEvidenceItems,
    degradedEvidenceReasons,
    initialDomains: indexedDomains.size,
    initialDocuments: indexed.length,
    sourcePoorInitialClusters: sourcePoorInitialCluster ? 1 : 0,
    enrichmentAttempted,
    enrichmentSources,
    enrichmentPersistedDocuments,
    enrichmentIndexedDocuments,
    finalEligibleDomains,
    finalEligibleDocuments,
    finalBlockage,
    publicationBlockedReason: publications > 0
      ? null
      : finalBlockage ?? blockages[0] ?? 'AUTOPUBLISH_DISABLED_OR_NOT_REACHED',
  };
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function buildBriefBlockages(input: {
  briefQueued: boolean;
  clustered: boolean;
  existingRun: { id: string; status: string; completedAt: Date | null; updatedAt: Date } | null;
  clusterOutcomes: EditorialClusterOutcome[];
}): Array<{ code: string; detail: Record<string, unknown> }> {
  if (input.briefQueued) return [];
  if (input.clusterOutcomes.length === 0) {
    if (input.clustered) {
      return [{ code: 'CLUSTER_ENQUEUED_AWAITING_RESULTS', detail: {} }];
    }
    if (input.existingRun && input.existingRun.status !== 'COMPLETED') {
      return [{
        code: 'CLUSTER_RUN_NOT_COMPLETED',
        detail: { runId: input.existingRun.id, status: input.existingRun.status },
      }];
    }
    return [{
      code: input.existingRun?.status === 'COMPLETED'
        ? 'CLUSTER_COMPLETED_WITHOUT_TOPICS'
        : 'NO_CLUSTER_TOPICS',
      detail: input.existingRun ? { runId: input.existingRun.id } : {},
    }];
  }
  return input.clusterOutcomes.map((outcome) => ({
    code: outcome.briefDisposition === 'suppressed'
      ? 'CANDIDATE_SUPPRESSED'
      : outcome.briefDisposition === 'already_processed'
        ? 'CANDIDATE_ALREADY_PROCESSED'
        : outcome.briefDisposition === 'eligible'
          ? 'ELIGIBLE_CANDIDATE_NOT_QUEUED'
          : 'CANDIDATE_SKIPPED',
    detail: {
      runId: outcome.runId,
      topicId: outcome.topicId,
      candidateId: outcome.candidateId,
      editorialScore: outcome.editorialScore,
      proposalMinimumEditorialScore: outcome.proposalMinimumEditorialScore,
      briefMinimumEditorialScore: outcome.briefMinimumEditorialScore,
      briefRequiredDomains: outcome.briefRequiredDomains,
      domainCount: outcome.domainCount,
      documentCount: outcome.documentCount,
      sourceCount: outcome.sourceCount,
      reasons: outcome.briefReasons,
    },
  }));
}

function sumNumeric(rows: Array<Record<string, unknown>>, key: string): number {
  return rows.reduce((sum, row) =>
    sum + (typeof row[key] === 'number' ? row[key] : 0), 0);
}

function uniqueJsonStrings(rows: Array<Record<string, unknown>>, key: string): string[] {
  return [...new Set(rows.flatMap((row) =>
    Array.isArray(row[key])
      ? row[key].filter((value): value is string => typeof value === 'string')
      : []))];
}

export async function startEditorialAutomationWorker() {
  const flags = resolveEditorialVerificationRuntimeFlags();
  if (!flags.automationEnabled || flags.automationKillSwitch) { workerLog.warn('Editorial automation worker remains disabled', { enabled: flags.automationEnabled, killSwitch: flags.automationKillSwitch }); return null; }
  const connection = createEditorialVerificationRedisConnection();
  const options = connection as unknown as ConnectionOptions;
  const discovery = createDiscoveryQueues(options); const documents = createDocumentQueues(options); const editorial = createEditorialShadowQueues(options); const briefs = createEditorialBriefQueues(options); const drafts = createEditorialDraftQueues(options); const verification = createEditorialVerificationQueues(options);
  const queues = { discoveryQueue: discovery.discoveryQueue, documentQueue: documents.documentQueue, editorialQueue: editorial.editorialQueue, briefQueue: briefs.briefQueue, draftQueue: drafts.draftQueue, verificationQueue: verification.verificationQueue };
  let running = false;
  const tick = async () => {
    if (running || await isRedisKillSwitchActive(connection as unknown as DiscoveryRedis, EDITORIAL_AUTOMATION_REDIS_KILL_SWITCH_KEY)) return;
    running = true;
    try { workerLog.info('Editorial automation tick completed', await runEditorialAutomationTick(flags, queues)); }
    catch (error) { workerLog.error('Editorial automation tick failed', { error: error instanceof Error ? error.message : String(error) }); }
    finally { running = false; }
  };
  await tick(); const timer = setInterval(() => { void tick(); }, flags.automationIntervalMs); timer.unref();
  return { async close() { clearInterval(timer); await Promise.all([discovery.discoveryQueue.close(), documents.documentQueue.close(), editorial.editorialQueue.close(), briefs.briefQueue.close(), drafts.draftQueue.close(), verification.verificationQueue.close(), connection.quit()]); } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startEditorialAutomationWorker().catch((error) => { workerLog.error('Editorial automation startup crashed', { error: error instanceof Error ? error.message : String(error) }); process.exit(1); });
