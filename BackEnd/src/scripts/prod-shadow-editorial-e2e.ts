import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { ConnectionOptions } from 'bullmq';
import { prisma } from '../lib/db.js';
import { assertProdShadowSafety, PROD_SHADOW_DISCOVERY_SOURCE_KEY, requireProdShadowWriteConfirmation } from '../lib/editorial-prod-shadow/safety.js';
import { buildDiscoveryJobId, createDiscoveryQueues, createDiscoveryRedisConnection, DISCOVERY_JOB_NAME } from '../lib/discovery/discovery-queue.js';
import { buildDocumentJobId, createDocumentQueues, enqueueDocumentJob, type DocumentQueues } from '../lib/document-corpus/document-queue.js';
import { buildEditorialShadowJobId, createEditorialShadowQueues, enqueueEditorialShadowJob, prepareEditorialShadowJob } from '../lib/editorial-shadow/editorial-queue.js';
import { createEditorialBriefQueues, enqueueEditorialBriefJob, prepareEditorialBriefJob } from '../lib/editorial-brief/brief-queue.js';
import { buildEditorialDraftJobId, createEditorialDraftQueues, enqueueEditorialDraftJob, prepareEditorialDraftJob } from '../lib/editorial-draft/draft-queue.js';
import { createEditorialVerificationQueues } from '../lib/editorial-verification/verification-queue.js';
import { enqueueEditorialVerificationForDraft } from '../lib/editorial-verification/enqueue-service.js';
import { EDITORIAL_MISTRAL_PROMPT_VERSION, type EditorialVerificationRetryReason } from '../lib/editorial-verification/types.js';
import { resolveEditorialValidationMode, type EditorialValidationMode } from '../lib/editorial-draft/validation-mode.js';
import { normalizeSourceDomain } from '../lib/source-profile.js';

export const PROD_SHADOW_FORBIDDEN_ACTIONS = ['authorize-publication', 'publish'] as const;
export type ProdShadowE2EStage = 'DISCOVERY' | 'DOCUMENT_INDEXING' | 'CLUSTERING' | 'BRIEF' | 'DRAFT' | 'QUALITY_GATE_BLOCKED' | 'WAITING_PIPELINE' | 'WAITING_HUMAN_APPROVAL' | 'VERIFICATION' | 'VERIFICATION_RETRY_REQUIRED' | 'COMPLETE';

export interface ProdShadowE2EState {
  sourceExists: boolean;
  sourceEnabled: boolean;
  discoveredDocuments: number;
  indexedDocuments: string[];
  actionableUnindexedDocuments: string[];
  terminalBlockedDocuments: ProdShadowTerminalBlockedDocument[];
  recentEmptyRuns: ProdShadowEmptyRun[];
  unindexedDocumentIds: string[];
  run: { id: string; status: string; topicCount: number; documentsConsidered: number } | null;
  brief: { id: string } | null;
  enrichment: {
    enrichmentStatus: string | null;
    independentDomains: string[];
    sourcesAccepted: number | null;
    sourcesRejected: number | null;
  } | null;
  draft: { id: string; briefId: string; status: string; currentRevisionStatus: string | null; contentHash: string | null; articleStatus: string | null; publishedAt: Date | null; humanReviewStatus: string | null; qualityGateDecision: string | null; qualityGateReasons: string[]; publicationAuditCount: number; articleSourcesComplete?: boolean; articleSourceDomains?: string[]; expectedArticleSourceDomains?: string[] } | null;
  verification: { id: string; status: string; shadowDecision: string | null; mistralPromptVersion?: string | null } | null;
}

export interface ProdShadowEmptyRun {
  id: string;
  status: string;
  windowStart: Date;
  windowEnd: Date;
  documentsConsidered: number;
  reason: 'window_miss' | 'no_indexed_docs' | 'source_mismatch' | 'status_mismatch';
}

export interface ProdShadowTerminalBlockedDocument {
  id: string;
  status: string;
  fetchError: string | null;
  robotsAllowed: boolean | null;
}

export interface ProdShadowDocumentStateInput {
  id: string;
  isIndexed: boolean;
  status: string;
  fetchError: string | null;
  robotsAllowed: boolean | null;
}

export interface ProdShadowDocumentEnqueueReport {
  documentId: string;
  oldJobId: string | null;
  oldJobState: string | null;
  action: 'enqueued' | 'enqueued-new-retry-job' | 'existing-job-retained';
  jobId: string;
}

const PROD_SHADOW_DOCUMENT_REVISION = 'prod-shadow-v1';

export async function enqueueProdShadowDocumentIndexing(
  queue: Pick<DocumentQueues['documentQueue'], 'add' | 'getJob'>,
  documentId: string,
  now = new Date(),
): Promise<ProdShadowDocumentEnqueueReport> {
  const oldJobId = buildDocumentJobId(documentId, PROD_SHADOW_DOCUMENT_REVISION);
  const oldJob = await queue.getJob(oldJobId);
  const oldJobState = oldJob ? await oldJob.getState() : null;
  const foundOldJobId = oldJob?.id ? String(oldJob.id) : null;

  if (oldJob && oldJobState !== 'failed') {
    return { documentId, oldJobId: foundOldJobId ?? oldJobId, oldJobState, action: 'existing-job-retained', jobId: oldJobId };
  }

  const retryingFailedJob = oldJobState === 'failed';
  const revision = retryingFailedJob
    ? `prod-shadow-retry-${now.getTime()}`
    : PROD_SHADOW_DOCUMENT_REVISION;
  const jobId = buildDocumentJobId(documentId, revision);
  await enqueueDocumentJob(queue, {
    documentId,
    revision,
    requestedAt: now.toISOString(),
    trigger: retryingFailedJob ? 'RETRY' : 'MANUAL',
  });
  return {
    documentId,
    oldJobId: foundOldJobId,
    oldJobState,
    action: retryingFailedJob ? 'enqueued-new-retry-job' : 'enqueued',
    jobId,
  };
}

export function prepareProdShadowClusteringRetry(documentId: string, now = new Date()) {
  return prepareEditorialShadowJob({
    windowStart: new Date(now.getTime() - 24 * 60 * 60_000),
    windowEnd: now,
    embeddingModel: 'text-embedding-3-small',
    trigger: 'PROD_SHADOW',
    documentIds: [documentId],
    config: { maxDocuments: 1, minProposalDocuments: 1, minProposalDomains: 1, proposalScoreThreshold: 0 },
  });
}

export function prepareProdShadowDraftRetry(briefId: string, now = new Date()) {
  return prepareEditorialDraftJob({
    briefId,
    requestedAt: now,
    trigger: 'PROD_SHADOW_RETRY',
    retryKey: `prod-shadow-retry-${randomUUID()}`,
  });
}

export function classifyProdShadowDocuments(documents: ProdShadowDocumentStateInput[]) {
  const indexedDocuments = documents.filter((document) => document.isIndexed || document.status === 'INDEXED').map((document) => document.id);
  const terminalBlockedDocuments = documents
    .filter(isTerminalBlockedDocument)
    .map(({ id, status, fetchError, robotsAllowed }) => ({ id, status, fetchError, robotsAllowed }));
  const terminalIds = new Set(terminalBlockedDocuments.map((document) => document.id));
  const actionableUnindexedDocuments = documents
    .filter((document) => !indexedDocuments.includes(document.id) && !terminalIds.has(document.id))
    .map((document) => document.id);
  return { indexedDocuments, actionableUnindexedDocuments, terminalBlockedDocuments };
}

export function determineProdShadowE2ENextStage(state: ProdShadowE2EState, options: { retryDraft?: boolean; validationMode?: EditorialValidationMode } = {}): ProdShadowE2EStage {
  if (!state.sourceExists || state.discoveredDocuments === 0) return 'DISCOVERY';
  const actionableDocumentCount = state.indexedDocuments.length + state.actionableUnindexedDocuments.length;
  if (actionableDocumentCount > 1) throw new Error('Production shadow may process at most one actionable controlled document');
  if (state.actionableUnindexedDocuments.length > 0) return 'DOCUMENT_INDEXING';
  if (state.sourceEnabled && state.terminalBlockedDocuments.length === state.discoveredDocuments) return 'DISCOVERY';
  if (state.run?.status === 'COMPLETED' && state.run.documentsConsidered === 0) return 'CLUSTERING';
  if (!state.run) return 'CLUSTERING';
  if (state.run.topicCount > 1) throw new Error('Production shadow may create at most one topic');
  if (state.run.status !== 'COMPLETED') return 'WAITING_PIPELINE';
  if (!state.brief) return 'BRIEF';
  if (!state.draft) return 'DRAFT';
  assertDraftRemainsUnpublished(state.draft);
  if (options.retryDraft && state.draft.status === 'FAILED') return 'DRAFT';
  if ((options.validationMode ?? resolveEditorialValidationMode()) === 'quality_gate') {
    if (state.draft.status === 'QUALITY_FAILED' || state.draft.qualityGateDecision === 'FAILED') return 'QUALITY_GATE_BLOCKED';
    if (state.draft.status === 'READY_FOR_REVIEW' && state.draft.currentRevisionStatus === 'GATE_PASSED' && state.draft.qualityGateDecision === 'PASSED') return 'VERIFICATION';
    if (state.draft.status === 'ARTICLE_DRAFT_CREATED' && state.draft.articleStatus === 'DRAFT' && state.draft.qualityGateDecision === 'PASSED') {
      if (state.draft.articleSourcesComplete === false) return 'VERIFICATION';
      if (verificationNeedsRetry(state.verification)) return 'VERIFICATION_RETRY_REQUIRED';
      return state.verification?.shadowDecision ? 'COMPLETE' : state.verification?.status === 'PENDING' || state.verification?.status === 'RUNNING' ? 'WAITING_PIPELINE' : 'VERIFICATION';
    }
    return 'WAITING_PIPELINE';
  }
  if (state.draft.status !== 'ARTICLE_DRAFT_CREATED' || state.draft.articleStatus !== 'DRAFT' || state.draft.humanReviewStatus !== 'APPROVED') return 'WAITING_HUMAN_APPROVAL';
  if (!state.verification?.shadowDecision) return 'VERIFICATION';
  return 'COMPLETE';
}

export function parseProdShadowE2EOptions(argv: string[]) {
  const advance = argv.includes('--advance');
  const retryDraft = argv.includes('--retry-draft');
  if (advance) requireProdShadowWriteConfirmation(argv);
  return { advance, retryDraft, validationMode: resolveEditorialValidationMode(), sourceKey: PROD_SHADOW_DISCOVERY_SOURCE_KEY, runId: value(argv, '--run-id'), briefId: value(argv, '--brief-id'), draftId: value(argv, '--draft-id') };
}

export async function inspectProdShadowE2EState(options: ReturnType<typeof parseProdShadowE2EOptions>): Promise<ProdShadowE2EState> {
  const source = await prisma.discoverySource.findUnique({ where: { key: options.sourceKey }, select: { id: true, enabled: true } });
  const documents = source ? await prisma.ingestedDocument.findMany({ where: { discoveries: { some: { discoverySourceId: source.id } } }, select: { id: true, isIndexed: true, status: true, fetchError: true, robotsAllowed: true }, take: 2 }) : [];
  const documentState = classifyProdShadowDocuments(documents);
  const runBase = options.runId ? await prisma.editorialRun.findUnique({ where: { id: options.runId }, select: { id: true, status: true, metrics: true } }) : null;
  const run = runBase ? { ...runBase, topicCount: await prisma.editorialTopic.count({ where: { runId: runBase.id } }), documentsConsidered: documentsConsidered(runBase.metrics) } : null;
  const emptyRunReason = emptyRunDiagnostic({ sourceExists: Boolean(source), indexedDocuments: documentState.indexedDocuments });
  const recentRuns = await prisma.editorialRun.findMany({
    where: { mode: 'SHADOW', status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    take: 5,
    select: { id: true, status: true, windowStart: true, windowEnd: true, metrics: true },
  });
  const recentEmptyRuns = recentRuns
    .filter((candidate) => documentsConsidered(candidate.metrics) === 0)
    .map((candidate) => ({ ...candidate, documentsConsidered: 0, reason: emptyRunReason }));
  const brief = options.briefId ? await prisma.editorialBrief.findUnique({
    where: { id: options.briefId },
    select: { id: true, dossier: { select: { metrics: true, sourceDomains: true } } },
  }) : null;
  const draft = options.draftId
    ? await prisma.editorialDraft.findUnique({
      where: { id: options.draftId },
      select: {
        id: true, briefId: true, status: true, currentRevision: { select: { status: true } }, contentHash: true,
        article: { select: { status: true, publishedAt: true, articleSources: { select: { source: { select: { domain: true } } } } } },
        brief: { select: { dossier: { select: { evidence: { select: { role: true, domain: true } } } } } },
        claims: { select: { evidence: { where: { criticConfirmed: true }, select: { briefEvidence: { select: { domain: true } } } } } },
        qualityGate: { select: { humanReviewStatus: true, automatedDecision: true, automatedReasons: true } },
        auditLogs: { where: { action: 'ARTICLE_PUBLISHED' }, select: { id: true } },
      },
    })
    : options.retryDraft && options.briefId
      ? await prisma.editorialDraft.findFirst({
        where: { briefId: options.briefId, status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, briefId: true, status: true, currentRevision: { select: { status: true } }, contentHash: true,
          article: { select: { status: true, publishedAt: true, articleSources: { select: { source: { select: { domain: true } } } } } },
          brief: { select: { dossier: { select: { evidence: { select: { role: true, domain: true } } } } } },
          claims: { select: { evidence: { where: { criticConfirmed: true }, select: { briefEvidence: { select: { domain: true } } } } } },
          qualityGate: { select: { humanReviewStatus: true, automatedDecision: true, automatedReasons: true } },
          auditLogs: { where: { action: 'ARTICLE_PUBLISHED' }, select: { id: true } },
        },
      })
      : null;
  const verification = draft ? await prisma.editorialVerificationRun.findFirst({ where: { draftId: draft.id }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, shadowDecision: true, mistralPromptVersion: true } }) : null;
  const expectedArticleSourceDomains = draft ? expectedSourceDomains(draft.brief?.dossier.evidence ?? [], draft.claims) : [];
  const articleSourceDomains = draft?.article?.articleSources.map((item) => normalizeSourceDomain(item.source.domain)).filter((domain): domain is string => Boolean(domain)) ?? [];
  const articleSourcesComplete = !draft?.article || expectedArticleSourceDomains.every((domain) => articleSourceDomains.includes(domain));
  return {
    sourceExists: Boolean(source), sourceEnabled: source?.enabled ?? false, discoveredDocuments: documents.length,
    ...documentState,
    recentEmptyRuns,
    // Compatibility field for existing operators: it now intentionally contains
    // only documents that can still be submitted to document-corpus.
    unindexedDocumentIds: documentState.actionableUnindexedDocuments,
    run,
    brief: brief ? { id: brief.id } : null,
    enrichment: brief ? enrichmentDiagnostic(brief.dossier.metrics, jsonStringArray(brief.dossier.sourceDomains)) : null,
    draft: draft ? { id: draft.id, briefId: draft.briefId, status: draft.status, currentRevisionStatus: draft.currentRevision?.status ?? null, contentHash: draft.contentHash, articleStatus: draft.article?.status ?? null, publishedAt: draft.article?.publishedAt ?? null, humanReviewStatus: draft.qualityGate?.humanReviewStatus ?? null, qualityGateDecision: draft.qualityGate?.automatedDecision ?? null, qualityGateReasons: jsonStringArray(draft.qualityGate?.automatedReasons), publicationAuditCount: draft.auditLogs.length, articleSourcesComplete, articleSourceDomains, expectedArticleSourceDomains } : null,
    verification: verification ? { ...verification } : null,
  };
}

export async function advanceProdShadowE2E(stage: ProdShadowE2EStage, state: ProdShadowE2EState, options: ReturnType<typeof parseProdShadowE2EOptions>) {
  assertProdShadowSafety(process.env);
  if (!options.advance) return { mode: 'DRY_RUN', nextStage: stage, forbiddenActions: PROD_SHADOW_FORBIDDEN_ACTIONS };
  if (['QUALITY_GATE_BLOCKED', 'WAITING_PIPELINE', 'WAITING_HUMAN_APPROVAL', 'COMPLETE'].includes(stage)) return { mode: 'NO_ACTION', nextStage: stage, forbiddenActions: PROD_SHADOW_FORBIDDEN_ACTIONS };
  const connection = createDiscoveryRedisConnection();
  const connectionOptions = connection as unknown as ConnectionOptions;
  const discovery = createDiscoveryQueues(connectionOptions);
  const document = createDocumentQueues(connectionOptions);
  const shadow = createEditorialShadowQueues(connectionOptions);
  const brief = createEditorialBriefQueues(connectionOptions);
  const draft = createEditorialDraftQueues(connectionOptions);
  const verification = createEditorialVerificationQueues(connectionOptions);
  const queues = [discovery.discoveryQueue, discovery.deadLetterQueue, document.documentQueue, document.deadLetterQueue, shadow.editorialQueue, shadow.deadLetterQueue, brief.briefQueue, brief.deadLetterQueue, draft.draftQueue, draft.deadLetterQueue, verification.verificationQueue, verification.deadLetterQueue];
  try {
    if (stage === 'DISCOVERY') {
      const source = await prisma.discoverySource.findUnique({ where: { key: options.sourceKey }, select: { id: true, enabled: true, maxItemsPerRun: true } });
      if (!source?.enabled || source.maxItemsPerRun !== 1) throw new Error('Production shadow source must exist, be enabled and be limited to one item');
      const scheduledFor = new Date();
      const jobId = buildDiscoveryJobId(source.id, scheduledFor);
      await discovery.discoveryQueue.add(DISCOVERY_JOB_NAME, { discoverySourceId: source.id, scheduledFor: scheduledFor.toISOString(), trigger: 'MANUAL' }, { jobId });
      return { mode: 'ENQUEUED', stage, jobId, maxDocuments: 1 };
    }
    if (stage === 'DOCUMENT_INDEXING') {
      if (state.actionableUnindexedDocuments.length !== 1) throw new Error('Production shadow may enqueue exactly one actionable controlled document');
      const retry = await enqueueProdShadowDocumentIndexing(document.documentQueue, state.actionableUnindexedDocuments[0]!);
      return { mode: 'ENQUEUED', stage, documents: 1, retry };
    }
    if (stage === 'CLUSTERING') {
      if (state.indexedDocuments.length !== 1) throw new Error('Production shadow requires exactly one indexed actionable document for clustering');
      const data = prepareProdShadowClusteringRetry(state.indexedDocuments[0]!);
      await enqueueEditorialShadowJob(shadow.editorialQueue, data);
      return { mode: 'ENQUEUED', stage, jobId: buildEditorialShadowJobId(data.idempotencyKey), controlledDocumentIds: data.documentIds, nextArgument: '--run-id=<EditorialRun.id>', maxTopics: 1 };
    }
    if (stage === 'BRIEF') {
      if (!state.run) throw new Error('--run-id is required for brief generation');
      if (state.run.topicCount !== 1) throw new Error('Production shadow requires exactly one topic before brief generation');
      await enqueueEditorialBriefJob(brief.briefQueue, prepareEditorialBriefJob({ editorialRunId: state.run.id, prodShadowControlled: true, config: { maximumCandidates: 1, maximumDocuments: 1, maximumChunksPerDocument: 5, maximumEvidenceChunks: 5 } }));
      return { mode: 'ENQUEUED', stage, nextArgument: '--brief-id=<EditorialBrief.id>' };
    }
    if (stage === 'DRAFT') {
      if (!state.brief) throw new Error('--brief-id is required for draft generation');
      if (options.retryDraft) {
        if (!state.draft || state.draft.status !== 'FAILED') throw new Error('Production-shadow draft retry requires an existing FAILED EditorialDraft');
        if (state.draft.briefId !== state.brief.id) throw new Error('Production-shadow draft retry brief mismatch');
        const retryData = prepareProdShadowDraftRetry(state.brief.id);
        await enqueueEditorialDraftJob(draft.draftQueue, retryData);
        return { mode: 'ENQUEUED', stage, jobId: buildEditorialDraftJobId(retryData), trigger: retryData.trigger, retryKey: retryData.retryKey, previousDraftId: state.draft.id, nextArgument: '--draft-id=<new EditorialDraft.id>', humanApprovalRequired: true };
      }
      const data = prepareEditorialDraftJob({ briefId: state.brief.id });
      await enqueueEditorialDraftJob(draft.draftQueue, data);
      return { mode: 'ENQUEUED', stage, nextArgument: '--draft-id=<EditorialDraft.id>', humanApprovalRequired: options.validationMode !== 'quality_gate' };
    }
    if (stage === 'VERIFICATION' || stage === 'VERIFICATION_RETRY_REQUIRED') {
      if (!state.draft?.contentHash) throw new Error('Current draft content hash is required');
      assertDraftRemainsUnpublished(state.draft);
      const retryReason = verificationRetryReason(stage, state);
      const result = await enqueueEditorialVerificationForDraft(prisma, { draftId: state.draft.id, expectedContentHash: state.draft.contentHash }, { queue: verification.verificationQueue, retryReason });
      return stage === 'VERIFICATION_RETRY_REQUIRED' ? { ...result, retry: 'CONTROLLED_VERIFICATION_RETRY' as const } : result;
    }
    throw new Error(`Unsupported production shadow stage: ${stage}`);
  } finally {
    await Promise.all(queues.map((queue) => queue.close().catch(() => undefined)));
    await connection.quit().catch(() => undefined);
  }
}

function assertDraftRemainsUnpublished(draft: NonNullable<ProdShadowE2EState['draft']>): void {
  if (draft.articleStatus === 'PUBLISHED' || draft.publishedAt || draft.publicationAuditCount > 0) {
    throw new Error('Production shadow safety violation: editorial article was published or has a publication audit');
  }
}
function expectedSourceDomains(evidence: Array<{ role: string; domain: string }>, claims: Array<{ evidence: Array<{ briefEvidence: { domain: string } }> }>): string[] {
  return [...new Set([
    ...evidence.filter((item) => item.role === 'PRIMARY').map((item) => normalizeSourceDomain(item.domain)),
    ...claims.flatMap((claim) => claim.evidence.map((item) => normalizeSourceDomain(item.briefEvidence.domain))),
  ].filter((domain): domain is string => Boolean(domain)))].sort();
}
function verificationNeedsRetry(verification: ProdShadowE2EState['verification']): boolean {
  if (!verification) return false;
  if (verification.mistralPromptVersion && verification.mistralPromptVersion !== EDITORIAL_MISTRAL_PROMPT_VERSION) return true;
  return verification.status !== 'PENDING' && verification.status !== 'RUNNING' && !verification.shadowDecision;
}
function verificationRetryReason(stage: ProdShadowE2EStage, state: ProdShadowE2EState): EditorialVerificationRetryReason | null {
  if (state.draft?.articleSourcesComplete === false) return 'ARTICLE_SOURCES_INCOMPLETE';
  if (stage !== 'VERIFICATION_RETRY_REQUIRED') return null;
  return state.verification?.mistralPromptVersion !== EDITORIAL_MISTRAL_PROMPT_VERSION
    ? 'VERIFICATION_PROMPT_UPGRADE'
    : 'TERMINAL_RUN_RETRY';
}
function isTerminalBlockedDocument(document: ProdShadowDocumentStateInput): boolean {
  return document.status === 'BLOCKED'
    || document.fetchError?.trim().toLowerCase() === 'robots_disallowed'
    || document.robotsAllowed === false;
}
function documentsConsidered(metrics: unknown): number {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return 0;
  const value = (metrics as Record<string, unknown>).documentsConsidered;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function jsonStringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function enrichmentDiagnostic(metrics: unknown, sourceDomains: string[]): NonNullable<ProdShadowE2EState['enrichment']> {
  const value = metrics && typeof metrics === 'object' && !Array.isArray(metrics)
    ? (metrics as Record<string, unknown>).enrichment
    : null;
  const enrichment = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    enrichmentStatus: typeof enrichment.enrichmentStatus === 'string' ? enrichment.enrichmentStatus : null,
    independentDomains: jsonStringArray(enrichment.independentDomains).length
      ? jsonStringArray(enrichment.independentDomains)
      : sourceDomains,
    sourcesAccepted: numberValue(enrichment.sourcesAccepted),
    sourcesRejected: numberValue(enrichment.sourcesRejected),
  };
}
function numberValue(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function emptyRunDiagnostic(input: { sourceExists: boolean; indexedDocuments: string[] }): ProdShadowEmptyRun['reason'] {
  if (!input.sourceExists) return 'source_mismatch';
  if (input.indexedDocuments.length === 0) return 'no_indexed_docs';
  return 'window_miss';
}
function value(argv: string[], name: string): string | null { const prefix = `${name}=`; return argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length).trim() || null; }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    assertProdShadowSafety(process.env);
    const options = parseProdShadowE2EOptions(process.argv.slice(2));
    inspectProdShadowE2EState(options).then(async (state) => {
      const nextStage = determineProdShadowE2ENextStage(state, options);
      const action = await advanceProdShadowE2E(nextStage, state, options);
      console.log(JSON.stringify({
        productionShadowOnly: true,
        validationMode: options.validationMode,
        enrichmentStatus: state.enrichment?.enrichmentStatus ?? null,
        independentDomains: state.enrichment?.independentDomains ?? [],
        sourcesAccepted: state.enrichment?.sourcesAccepted ?? null,
        sourcesRejected: state.enrichment?.sourcesRejected ?? null,
        qualityGateDecision: state.draft?.qualityGateDecision ?? null,
        qualityGateReasons: state.draft?.qualityGateReasons ?? [],
        draftStatus: state.draft?.status ?? null,
        state, nextStage, action, forbiddenActions: PROD_SHADOW_FORBIDDEN_ACTIONS,
      }, null, 2));
    }).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; })
      .finally(() => prisma.$disconnect());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
    void prisma.$disconnect();
  }
}
