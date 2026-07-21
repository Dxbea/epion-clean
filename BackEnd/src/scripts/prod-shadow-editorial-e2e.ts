import { fileURLToPath } from 'node:url';
import type { ConnectionOptions } from 'bullmq';
import { prisma } from '../lib/db.js';
import { assertProdShadowSafety, PROD_SHADOW_DISCOVERY_SOURCE_KEY, requireProdShadowWriteConfirmation } from '../lib/editorial-prod-shadow/safety.js';
import { buildDiscoveryJobId, createDiscoveryQueues, createDiscoveryRedisConnection, DISCOVERY_JOB_NAME } from '../lib/discovery/discovery-queue.js';
import { buildDocumentJobId, createDocumentQueues, enqueueDocumentJob, type DocumentQueues } from '../lib/document-corpus/document-queue.js';
import { buildEditorialShadowJobId, createEditorialShadowQueues, enqueueEditorialShadowJob, prepareEditorialShadowJob } from '../lib/editorial-shadow/editorial-queue.js';
import { createEditorialBriefQueues, enqueueEditorialBriefJob, prepareEditorialBriefJob } from '../lib/editorial-brief/brief-queue.js';
import { createEditorialDraftQueues, enqueueEditorialDraftJob, prepareEditorialDraftJob } from '../lib/editorial-draft/draft-queue.js';
import { createEditorialVerificationQueues } from '../lib/editorial-verification/verification-queue.js';
import { enqueueEditorialVerificationForDraft } from '../lib/editorial-verification/enqueue-service.js';

export const PROD_SHADOW_FORBIDDEN_ACTIONS = ['authorize-publication', 'publish'] as const;
export type ProdShadowE2EStage = 'DISCOVERY' | 'DOCUMENT_INDEXING' | 'CLUSTERING' | 'BRIEF' | 'DRAFT' | 'WAITING_PIPELINE' | 'WAITING_HUMAN_APPROVAL' | 'VERIFICATION' | 'COMPLETE';

export interface ProdShadowE2EState {
  sourceExists: boolean;
  sourceEnabled: boolean;
  discoveredDocuments: number;
  indexedDocuments: string[];
  actionableUnindexedDocuments: string[];
  terminalBlockedDocuments: ProdShadowTerminalBlockedDocument[];
  unindexedDocumentIds: string[];
  run: { id: string; status: string; topicCount: number } | null;
  brief: { id: string } | null;
  draft: { id: string; status: string; contentHash: string | null; articleStatus: string | null; publishedAt: Date | null; humanReviewStatus: string | null; publicationAuditCount: number } | null;
  verification: { id: string; status: string; shadowDecision: string | null } | null;
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

export function determineProdShadowE2ENextStage(state: ProdShadowE2EState): ProdShadowE2EStage {
  if (!state.sourceExists || state.discoveredDocuments === 0) return 'DISCOVERY';
  const actionableDocumentCount = state.indexedDocuments.length + state.actionableUnindexedDocuments.length;
  if (actionableDocumentCount > 1) throw new Error('Production shadow may process at most one actionable controlled document');
  if (state.actionableUnindexedDocuments.length > 0) return 'DOCUMENT_INDEXING';
  if (state.sourceEnabled && state.terminalBlockedDocuments.length === state.discoveredDocuments) return 'DISCOVERY';
  if (!state.run) return 'CLUSTERING';
  if (state.run.topicCount > 1) throw new Error('Production shadow may create at most one topic');
  if (state.run.status !== 'COMPLETED') return 'WAITING_PIPELINE';
  if (!state.brief) return 'BRIEF';
  if (!state.draft) return 'DRAFT';
  assertDraftRemainsUnpublished(state.draft);
  if (state.draft.status !== 'ARTICLE_DRAFT_CREATED' || state.draft.articleStatus !== 'DRAFT' || state.draft.humanReviewStatus !== 'APPROVED') return 'WAITING_HUMAN_APPROVAL';
  if (!state.verification?.shadowDecision) return 'VERIFICATION';
  return 'COMPLETE';
}

export function parseProdShadowE2EOptions(argv: string[]) {
  const advance = argv.includes('--advance');
  if (advance) requireProdShadowWriteConfirmation(argv);
  return { advance, sourceKey: PROD_SHADOW_DISCOVERY_SOURCE_KEY, runId: value(argv, '--run-id'), briefId: value(argv, '--brief-id'), draftId: value(argv, '--draft-id') };
}

export async function inspectProdShadowE2EState(options: ReturnType<typeof parseProdShadowE2EOptions>): Promise<ProdShadowE2EState> {
  const source = await prisma.discoverySource.findUnique({ where: { key: options.sourceKey }, select: { id: true, enabled: true } });
  const documents = source ? await prisma.ingestedDocument.findMany({ where: { discoveries: { some: { discoverySourceId: source.id } } }, select: { id: true, isIndexed: true, status: true, fetchError: true, robotsAllowed: true }, take: 2 }) : [];
  const documentState = classifyProdShadowDocuments(documents);
  const runBase = options.runId ? await prisma.editorialRun.findUnique({ where: { id: options.runId }, select: { id: true, status: true } }) : null;
  const run = runBase ? { ...runBase, topicCount: await prisma.editorialTopic.count({ where: { runId: runBase.id } }) } : null;
  const brief = options.briefId ? await prisma.editorialBrief.findUnique({ where: { id: options.briefId }, select: { id: true } }) : null;
  const draft = options.draftId ? await prisma.editorialDraft.findUnique({
    where: { id: options.draftId },
    select: { id: true, status: true, contentHash: true, article: { select: { status: true, publishedAt: true } }, qualityGate: { select: { humanReviewStatus: true } }, auditLogs: { where: { action: 'ARTICLE_PUBLISHED' }, select: { id: true } } },
  }) : null;
  const verification = draft ? await prisma.editorialVerificationRun.findFirst({ where: { draftId: draft.id }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, shadowDecision: true } }) : null;
  return {
    sourceExists: Boolean(source), sourceEnabled: source?.enabled ?? false, discoveredDocuments: documents.length,
    ...documentState,
    // Compatibility field for existing operators: it now intentionally contains
    // only documents that can still be submitted to document-corpus.
    unindexedDocumentIds: documentState.actionableUnindexedDocuments,
    run, brief,
    draft: draft ? { id: draft.id, status: draft.status, contentHash: draft.contentHash, articleStatus: draft.article?.status ?? null, publishedAt: draft.article?.publishedAt ?? null, humanReviewStatus: draft.qualityGate?.humanReviewStatus ?? null, publicationAuditCount: draft.auditLogs.length } : null,
    verification,
  };
}

export async function advanceProdShadowE2E(stage: ProdShadowE2EStage, state: ProdShadowE2EState, options: ReturnType<typeof parseProdShadowE2EOptions>) {
  assertProdShadowSafety(process.env);
  if (!options.advance) return { mode: 'DRY_RUN', nextStage: stage, forbiddenActions: PROD_SHADOW_FORBIDDEN_ACTIONS };
  if (['WAITING_PIPELINE', 'WAITING_HUMAN_APPROVAL', 'COMPLETE'].includes(stage)) return { mode: 'NO_ACTION', nextStage: stage, forbiddenActions: PROD_SHADOW_FORBIDDEN_ACTIONS };
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
      const windowEnd = new Date(); const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60_000);
      const data = prepareEditorialShadowJob({ windowStart, windowEnd, embeddingModel: 'text-embedding-3-small', trigger: 'MANUAL', config: { maxDocuments: 1, minProposalDocuments: 1, minProposalDomains: 1, proposalScoreThreshold: 0 } });
      await enqueueEditorialShadowJob(shadow.editorialQueue, data);
      return { mode: 'ENQUEUED', stage, jobId: buildEditorialShadowJobId(data.idempotencyKey), nextArgument: '--run-id=<EditorialRun.id>', maxTopics: 1 };
    }
    if (stage === 'BRIEF') {
      if (!state.run) throw new Error('--run-id is required for brief generation');
      if (state.run.topicCount !== 1) throw new Error('Production shadow requires exactly one topic before brief generation');
      await enqueueEditorialBriefJob(brief.briefQueue, prepareEditorialBriefJob({ editorialRunId: state.run.id }));
      return { mode: 'ENQUEUED', stage, nextArgument: '--brief-id=<EditorialBrief.id>' };
    }
    if (stage === 'DRAFT') {
      if (!state.brief) throw new Error('--brief-id is required for draft generation');
      await enqueueEditorialDraftJob(draft.draftQueue, prepareEditorialDraftJob({ briefId: state.brief.id }));
      return { mode: 'ENQUEUED', stage, nextArgument: '--draft-id=<EditorialDraft.id>', humanApprovalRequired: true };
    }
    if (stage === 'VERIFICATION') {
      if (!state.draft?.contentHash) throw new Error('Current draft content hash is required');
      assertDraftRemainsUnpublished(state.draft);
      return await enqueueEditorialVerificationForDraft(prisma, { draftId: state.draft.id, expectedContentHash: state.draft.contentHash }, { queue: verification.verificationQueue });
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
function isTerminalBlockedDocument(document: ProdShadowDocumentStateInput): boolean {
  return document.status === 'BLOCKED'
    || document.fetchError?.trim().toLowerCase() === 'robots_disallowed'
    || document.robotsAllowed === false;
}
function value(argv: string[], name: string): string | null { const prefix = `${name}=`; return argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length).trim() || null; }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    assertProdShadowSafety(process.env);
    const options = parseProdShadowE2EOptions(process.argv.slice(2));
    inspectProdShadowE2EState(options).then(async (state) => {
      const nextStage = determineProdShadowE2ENextStage(state);
      const action = await advanceProdShadowE2E(nextStage, state, options);
      console.log(JSON.stringify({ productionShadowOnly: true, state, nextStage, action, forbiddenActions: PROD_SHADOW_FORBIDDEN_ACTIONS }, null, 2));
    }).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; })
      .finally(() => prisma.$disconnect());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
    void prisma.$disconnect();
  }
}
