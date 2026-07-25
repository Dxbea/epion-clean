import { fileURLToPath } from 'node:url';
import { type ConnectionOptions } from 'bullmq';
import { prisma } from '../lib/db.js';
import { createDiscoveryQueues, buildDiscoveryJobId, DISCOVERY_JOB_NAME } from '../lib/discovery/discovery-queue.js';
import { createDocumentQueues, enqueueDocumentJob } from '../lib/document-corpus/document-queue.js';
import { DOCUMENT_EMBEDDING_MODEL } from '../lib/document-corpus/document-rag-service.js';
import { createEditorialShadowQueues, enqueueEditorialShadowJob, prepareEditorialShadowJob } from '../lib/editorial-shadow/editorial-queue.js';
import { createEditorialBriefQueues, enqueueEditorialBriefJob, prepareEditorialBriefJob } from '../lib/editorial-brief/brief-queue.js';
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
  documentsQueuedForIndexing: number;
  documentsIndexed: number;
  documentsBlocked: Array<{ documentId: string; reason: string }>;
  clusters: number;
  briefs: number;
  drafts: number;
  verifications: number;
  publications: number;
  blockages: string[];
}

export async function runEditorialAutomationTick(
  flags: EditorialVerificationRuntimeFlags,
  queues: any,
  now = new Date(),
): Promise<EditorialAutomationReport> {
  if (!flags.automationSourceKeys.length) throw new Error('EDITORIAL_AUTOMATION_SOURCE_KEYS is required when automation is enabled');
  const { windowStart, windowEnd } = editorialAutomationWindow(now);
  const sources = await prisma.discoverySource.findMany({
    where: { key: { in: flags.automationSourceKeys }, enabled: true, disabledReason: null, accessPolicy: { not: 'BLOCKED' } },
    select: { id: true, key: true, sourceId: true, categoryId: true },
  });
  if (sources.length !== flags.automationSourceKeys.length) throw new Error('Configured editorial automation sources must exist, be enabled and not blocked');
  const durableSourceIds = sources.map((source) => source.sourceId).filter((sourceId): sourceId is string => Boolean(sourceId));
  if (durableSourceIds.length !== sources.length) throw new Error('Configured editorial automation sources require a durable DiscoverySource.sourceId');
  const selectionStart = new Date(now.getTime() - 24 * 60 * 60_000);
  const scopedDocuments = await prisma.ingestedDocument.findMany({
    where: { sourceId: { in: durableSourceIds }, discoveredAt: { gte: selectionStart, lte: now } },
    select: { id: true, status: true, isIndexed: true, robotsAllowed: true, accessPolicy: true, storagePolicy: true },
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
    orderBy: { discoveredAt: 'asc' }, take: flags.automationMaximumDocuments, select: { id: true },
  });
  const existingRun = await prisma.editorialRun.findFirst({ where: { windowStart, windowEnd }, select: { id: true, status: true } });
  let clustered = false;
  if (!existingRun && indexed.length >= 2) {
    const job = prepareEditorialShadowJob({ windowStart, windowEnd, embeddingModel: DOCUMENT_EMBEDDING_MODEL, documentIds: indexed.map((item) => item.id), trigger: 'SCHEDULED', requestedAt: now, config: { maxDocuments: flags.automationMaximumDocuments, minProposalDocuments: 2, minProposalDomains: 2 } });
    await enqueueEditorialShadowJob(queues.editorialQueue, job);
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
  const blockages = [
    ...(sources.filter((source) => !source.categoryId).map((source) => `MISSING_CATEGORY:${source.key}`)),
    ...(documents.length === 0 ? ['NO_INDEXABLE_DISCOVERED_DOCUMENTS'] : []),
  ];
  const publications = await prisma.editorialReviewAuditLog.count({
    where: { action: 'ARTICLE_PUBLISHED', operationKey: { startsWith: 'editorial-autopublish:' }, createdAt: { gte: windowStart, lt: windowEnd } },
  });
  return {
    discoveryJobsStarted: sources.length,
    documentsDiscovered: scopedDocuments.filter((document) => document.status === 'DISCOVERED').length,
    documentsAlreadyIndexed: scopedDocuments.filter((document) => document.isIndexed).length,
    documentsQueuedForIndexing: documents.length,
    documentsIndexed: indexed.length,
    documentsBlocked: blocked,
    clusters: clustered ? 1 : 0,
    briefs: brief ? 1 : 0,
    drafts: draft ? 1 : 0,
    verifications: verification ? 1 : 0,
    publications,
    blockages,
  };
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
