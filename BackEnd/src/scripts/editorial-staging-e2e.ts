import { fileURLToPath } from 'node:url';
import type { ConnectionOptions } from 'bullmq';
import { prisma } from '../lib/db.js';
import { assertStagingShadowSafety, requireStagingWriteConfirmation, STAGING_DISCOVERY_SOURCE_KEY } from '../lib/editorial-staging/safety.js';
import { buildDiscoveryJobId, createDiscoveryQueues, createDiscoveryRedisConnection, DISCOVERY_JOB_NAME } from '../lib/discovery/discovery-queue.js';
import { createDocumentQueues, enqueueDocumentJob } from '../lib/document-corpus/document-queue.js';
import { buildEditorialShadowJobId, createEditorialShadowQueues, enqueueEditorialShadowJob, prepareEditorialShadowJob } from '../lib/editorial-shadow/editorial-queue.js';
import { createEditorialBriefQueues, enqueueEditorialBriefJob, prepareEditorialBriefJob } from '../lib/editorial-brief/brief-queue.js';
import { createEditorialDraftQueues, enqueueEditorialDraftJob, prepareEditorialDraftJob } from '../lib/editorial-draft/draft-queue.js';
import { createEditorialVerificationQueues } from '../lib/editorial-verification/verification-queue.js';
import { enqueueEditorialVerificationForDraft } from '../lib/editorial-verification/enqueue-service.js';
import { EDITORIAL_MISTRAL_PROMPT_VERSION } from '../lib/editorial-verification/types.js';
import { resolveEditorialValidationMode, type EditorialValidationMode } from '../lib/editorial-draft/validation-mode.js';
import { normalizeSourceDomain } from '../lib/source-profile.js';

export type StagingE2EStage =
  | 'DISCOVERY' | 'DOCUMENT_INDEXING' | 'CLUSTERING' | 'BRIEF' | 'DRAFT'
  | 'QUALITY_GATE_BLOCKED' | 'WAITING_PIPELINE' | 'WAITING_HUMAN_APPROVAL' | 'VERIFICATION' | 'VERIFICATION_RETRY_REQUIRED' | 'COMPLETE';

export interface StagingE2EState {
  sourceExists: boolean;
  discoveredDocuments: number;
  unindexedDocumentIds: string[];
  run: { id: string; status: string } | null;
  brief: { id: string } | null;
  draft: { id: string; status: string; currentRevisionStatus: string | null; contentHash: string | null; articleStatus: string | null; humanReviewStatus: string | null; qualityGateDecision: string | null; qualityGateReasons: string[]; articleSourcesComplete?: boolean; articleSourceDomains?: string[]; expectedArticleSourceDomains?: string[] } | null;
  verification: { id: string; status: string; shadowDecision: string | null; mistralPromptVersion?: string | null } | null;
}

export function determineStagingE2ENextStage(state: StagingE2EState, options: { validationMode?: EditorialValidationMode } = {}): StagingE2EStage {
  if (!state.sourceExists || state.discoveredDocuments === 0) return 'DISCOVERY';
  if (state.unindexedDocumentIds.length > 0) return 'DOCUMENT_INDEXING';
  if (!state.run) return 'CLUSTERING';
  if (state.run.status !== 'COMPLETED') return 'WAITING_PIPELINE';
  if (!state.brief) return 'BRIEF';
  if (!state.draft) return 'DRAFT';
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

export function parseStagingE2EOptions(argv: string[]) {
  const advance = argv.includes('--advance');
  if (advance) requireStagingWriteConfirmation(argv);
  return {
    advance,
    validationMode: resolveEditorialValidationMode(),
    sourceKey: value(argv, '--source-key') ?? STAGING_DISCOVERY_SOURCE_KEY,
    runId: value(argv, '--run-id'), briefId: value(argv, '--brief-id'), draftId: value(argv, '--draft-id'),
  };
}

export async function inspectStagingE2EState(options: ReturnType<typeof parseStagingE2EOptions>): Promise<StagingE2EState> {
  const source = await prisma.discoverySource.findUnique({ where: { key: options.sourceKey }, select: { id: true } });
  const documents = source ? await prisma.ingestedDocument.findMany({
    where: { discoveries: { some: { discoverySourceId: source.id } } },
    select: { id: true, isIndexed: true, status: true }, take: 100,
  }) : [];
  const run = options.runId ? await prisma.editorialRun.findUnique({ where: { id: options.runId }, select: { id: true, status: true } }) : null;
  const brief = options.briefId ? await prisma.editorialBrief.findUnique({ where: { id: options.briefId }, select: { id: true } }) : null;
  const draft = options.draftId ? await prisma.editorialDraft.findUnique({
    where: { id: options.draftId },
    select: {
      id: true, status: true, currentRevision: { select: { status: true } }, contentHash: true,
      article: { select: { status: true, articleSources: { select: { source: { select: { domain: true } } } } } },
      brief: { select: { dossier: { select: { evidence: { select: { role: true, domain: true } } } } } },
      claims: { select: { evidence: { where: { criticConfirmed: true }, select: { briefEvidence: { select: { domain: true } } } } } },
      qualityGate: { select: { humanReviewStatus: true, automatedDecision: true, automatedReasons: true } },
    },
  }) : null;
  const verification = draft ? await prisma.editorialVerificationRun.findFirst({
    where: { draftId: draft.id }, orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, shadowDecision: true, mistralPromptVersion: true },
  }) : null;
  const expectedArticleSourceDomains = draft ? expectedSourceDomains(draft.brief?.dossier.evidence ?? [], draft.claims) : [];
  const articleSourceDomains = draft?.article?.articleSources.map((item) => normalizeSourceDomain(item.source.domain)).filter((domain): domain is string => Boolean(domain)) ?? [];
  const articleSourcesComplete = !draft?.article || expectedArticleSourceDomains.every((domain) => articleSourceDomains.includes(domain));
  return {
    sourceExists: Boolean(source), discoveredDocuments: documents.length,
    unindexedDocumentIds: documents.filter((document) => !document.isIndexed || document.status !== 'INDEXED').map((document) => document.id),
    run, brief,
    draft: draft ? { id: draft.id, status: draft.status, currentRevisionStatus: draft.currentRevision?.status ?? null, contentHash: draft.contentHash, articleStatus: draft.article?.status ?? null, humanReviewStatus: draft.qualityGate?.humanReviewStatus ?? null, qualityGateDecision: draft.qualityGate?.automatedDecision ?? null, qualityGateReasons: jsonStringArray(draft.qualityGate?.automatedReasons), articleSourcesComplete, articleSourceDomains, expectedArticleSourceDomains } : null,
    verification: verification ? { ...verification } : null,
  };
}

export async function advanceStagingE2E(stage: StagingE2EStage, state: StagingE2EState, options: ReturnType<typeof parseStagingE2EOptions>) {
  assertStagingShadowSafety(process.env);
  if (!options.advance) return { mode: 'DRY_RUN', nextStage: stage };
  if (['QUALITY_GATE_BLOCKED', 'WAITING_PIPELINE', 'WAITING_HUMAN_APPROVAL', 'COMPLETE'].includes(stage)) return { mode: 'NO_ACTION', nextStage: stage };
  const connection = createDiscoveryRedisConnection();
  const connectionOptions = connection as unknown as ConnectionOptions;
  const discovery = createDiscoveryQueues(connectionOptions);
  const document = createDocumentQueues(connectionOptions);
  const shadow = createEditorialShadowQueues(connectionOptions);
  const brief = createEditorialBriefQueues(connectionOptions);
  const draft = createEditorialDraftQueues(connectionOptions);
  const verification = createEditorialVerificationQueues(connectionOptions);
  const allQueues = [discovery.discoveryQueue, discovery.deadLetterQueue, document.documentQueue, document.deadLetterQueue, shadow.editorialQueue, shadow.deadLetterQueue, brief.briefQueue, brief.deadLetterQueue, draft.draftQueue, draft.deadLetterQueue, verification.verificationQueue, verification.deadLetterQueue];
  try {
    if (stage === 'DISCOVERY') {
      const source = await prisma.discoverySource.findUnique({ where: { key: options.sourceKey }, select: { id: true, enabled: true } });
      if (!source?.enabled) throw new Error('Staging DiscoverySource must exist and be enabled');
      const scheduledFor = new Date();
      const jobId = buildDiscoveryJobId(source.id, scheduledFor);
      await discovery.discoveryQueue.add(DISCOVERY_JOB_NAME, { discoverySourceId: source.id, scheduledFor: scheduledFor.toISOString(), trigger: 'MANUAL' }, { jobId });
      return { mode: 'ENQUEUED', stage, jobId };
    }
    if (stage === 'DOCUMENT_INDEXING') {
      for (const documentId of state.unindexedDocumentIds.slice(0, 20)) await enqueueDocumentJob(document.documentQueue, { documentId, revision: 'staging-shadow-v1', requestedAt: new Date().toISOString(), trigger: 'MANUAL' });
      return { mode: 'ENQUEUED', stage, documents: Math.min(20, state.unindexedDocumentIds.length) };
    }
    if (stage === 'CLUSTERING') {
      const windowEnd = new Date(); const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60_000);
      const data = prepareEditorialShadowJob({ windowStart, windowEnd, embeddingModel: 'text-embedding-3-small', trigger: 'MANUAL' });
      await enqueueEditorialShadowJob(shadow.editorialQueue, data);
      return { mode: 'ENQUEUED', stage, jobId: buildEditorialShadowJobId(data.idempotencyKey), nextArgument: '--run-id=<EditorialRun.id>' };
    }
    if (stage === 'BRIEF') {
      if (!state.run) throw new Error('--run-id is required for brief generation');
      await enqueueEditorialBriefJob(brief.briefQueue, prepareEditorialBriefJob({ editorialRunId: state.run.id }));
      return { mode: 'ENQUEUED', stage, nextArgument: '--brief-id=<EditorialBrief.id>' };
    }
    if (stage === 'DRAFT') {
      if (!state.brief) throw new Error('--brief-id is required for draft generation');
      await enqueueEditorialDraftJob(draft.draftQueue, prepareEditorialDraftJob({ briefId: state.brief.id }));
      return { mode: 'ENQUEUED', stage, nextArgument: '--draft-id=<EditorialDraft.id>', humanApprovalRequired: options.validationMode !== 'quality_gate' };
    }
    if (stage === 'VERIFICATION' || stage === 'VERIFICATION_RETRY_REQUIRED') {
      if (!state.draft?.contentHash) throw new Error('Current draft content hash is required');
      const result = await enqueueEditorialVerificationForDraft(prisma, { draftId: state.draft.id, expectedContentHash: state.draft.contentHash }, { queue: verification.verificationQueue });
      return stage === 'VERIFICATION_RETRY_REQUIRED' ? { ...result, retry: 'CONTROLLED_VERIFICATION_RETRY' as const } : result;
    }
    throw new Error(`Unsupported staging E2E stage: ${stage}`);
  } finally {
    await Promise.all(allQueues.map((queue) => queue.close().catch(() => undefined)));
    await connection.quit().catch(() => undefined);
  }
}

function jsonStringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function expectedSourceDomains(evidence: Array<{ role: string; domain: string }>, claims: Array<{ evidence: Array<{ briefEvidence: { domain: string } }> }>): string[] {
  return [...new Set([
    ...evidence.filter((item) => item.role === 'PRIMARY').map((item) => normalizeSourceDomain(item.domain)),
    ...claims.flatMap((claim) => claim.evidence.map((item) => normalizeSourceDomain(item.briefEvidence.domain))),
  ].filter((domain): domain is string => Boolean(domain)))].sort();
}
function verificationNeedsRetry(verification: StagingE2EState['verification']): boolean {
  if (!verification) return false;
  if (verification.mistralPromptVersion && verification.mistralPromptVersion !== EDITORIAL_MISTRAL_PROMPT_VERSION) return true;
  return verification.status !== 'PENDING' && verification.status !== 'RUNNING' && !verification.shadowDecision;
}
function value(argv: string[], name: string): string | null { const prefix = `${name}=`; return argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length).trim() || null; }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseStagingE2EOptions(process.argv.slice(2));
    assertStagingShadowSafety(process.env);
    inspectStagingE2EState(options).then(async (state) => {
      const nextStage = determineStagingE2ENextStage(state, options);
      const action = await advanceStagingE2E(nextStage, state, options);
      console.log(JSON.stringify({ shadowOnly: true, validationMode: options.validationMode, qualityGateDecision: state.draft?.qualityGateDecision ?? null, qualityGateReasons: state.draft?.qualityGateReasons ?? [], draftStatus: state.draft?.status ?? null, state, nextStage, action }, null, 2));
    }).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; })
      .finally(() => prisma.$disconnect());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
    void prisma.$disconnect();
  }
}
