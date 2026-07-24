import { fileURLToPath } from 'node:url';
import {
  DelayedError,
  UnrecoverableError,
  Worker,
  type ConnectionOptions,
  type Job,
  type Processor,
  type Queue,
} from 'bullmq';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { createDocumentQueues, enqueueDocumentJob } from '../lib/document-corpus/document-queue.js';
import { acquireRedisLock, isRedisKillSwitchActive, type DiscoveryRedis } from '../lib/discovery/redis-lock.js';
import { logger } from '../lib/logger.js';
import { searchSerperStrict } from '../lib/serper.js';
import { EditorialVerificationBudgetExceededError, EditorialVerificationBudgetService } from '../lib/editorial-verification/budget-service.js';
import { MistralEditorialAuditor } from '../lib/editorial-verification/mistral-auditor.js';
import { reconcileEditorialVerificationRuns } from '../lib/editorial-verification/reconciliation.js';
import {
  EDITORIAL_VERIFICATION_REDIS_KILL_SWITCH_KEY,
  resolveEditorialVerificationRuntimeFlags,
  type EditorialVerificationRuntimeFlags,
} from '../lib/editorial-verification/runtime-flags.js';
import { calculateEditorialShadowEligibility } from '../lib/editorial-verification/shadow-eligibility.js';
import {
  EDITORIAL_VERIFICATION_VERSION,
  RetryableEditorialVerificationDependencyError,
  type EditorialMistralAuditor,
  type EditorialVerificationSourceHydrator,
} from '../lib/editorial-verification/types.js';
import {
  buildEditorialVerificationDeadLetterJobId,
  buildEditorialVerificationJobId,
  createEditorialVerificationQueues,
  createEditorialVerificationRedisConnection,
  EDITORIAL_VERIFICATION_DLQ_JOB_NAME,
  EDITORIAL_VERIFICATION_JOB_ATTEMPTS,
  EDITORIAL_VERIFICATION_QUEUE_NAME,
  type EditorialVerificationDeadLetterData,
  type EditorialVerificationJobData,
} from '../lib/editorial-verification/verification-queue.js';
import { EditorialVerificationMetrics } from '../lib/editorial-verification/verification-metrics.js';
import {
  TrustScoreEditorialSourceHydrator,
  verifyEditorialDraftForFinalization,
} from '../lib/editorial-verification/verification-service.js';

const workerLog = logger.child({ module: 'EditorialVerificationWorker' });
const LOCK_PREFIX = 'epion:editorial-verification:draft-lock:';
const DOCUMENT_REVISION = 'editorial-serper-v1';

export interface EditorialVerificationProcessorDependencies {
  client: PrismaClient;
  redis: DiscoveryRedis;
  flags: EditorialVerificationRuntimeFlags;
  metrics: EditorialVerificationMetrics;
  budget: EditorialVerificationBudgetService;
  documentQueue: Pick<Queue<any>, 'add'>;
  verifyDraft?: typeof verifyEditorialDraftForFinalization;
  serperSearcher?: typeof searchSerperStrict;
  mistralAuditor?: EditorialMistralAuditor;
  sourceHydrator?: EditorialVerificationSourceHydrator;
  now?: () => Date;
}

export function createEditorialVerificationProcessor(
  dependencies: EditorialVerificationProcessorDependencies,
): Processor<EditorialVerificationJobData> {
  return async (job) => {
    const now = dependencies.now ?? (() => new Date());
    if (dependencies.flags.killSwitch || await isRedisKillSwitchActive(dependencies.redis, EDITORIAL_VERIFICATION_REDIS_KILL_SWITCH_KEY)) {
      return delayJob(job, dependencies.flags.pausedJobDelayMs, 'Editorial verification kill switch is active');
    }
    await validateJob(dependencies.client, job);
    const lock = await acquireRedisLock(dependencies.redis, `${LOCK_PREFIX}${job.data.draftId}`, dependencies.flags.runLockTtlMs);
    if (!lock) {
      dependencies.metrics.increment('lockMisses');
      return delayJob(job, 30_000, 'Editorial verification draft lock is held');
    }
    const heartbeat = startHeartbeat(lock, dependencies.flags.runLockTtlMs);
    const startedAt = Date.now();
    dependencies.metrics.increment('jobsStarted');
    try {
      await dependencies.budget.consume('VERIFICATION');
      const calls = createBudgetedDependencies(dependencies);
      const verifyDraft = dependencies.verifyDraft ?? verifyEditorialDraftForFinalization;
      const result = await verifyDraft(dependencies.client, {
        draftId: job.data.draftId,
        expectedContentHash: job.data.expectedContentHash,
        retryReason: job.data.retryReason,
        retryAttempt: job.data.retryAttempt,
      }, {
        serperSearcher: calls.serperSearcher,
        mistralAuditor: calls.mistralAuditor,
        sourceHydrator: calls.sourceHydrator,
        now,
      });
      dependencies.metrics.recordResult(result);
      const documentsEnqueued = await enqueueSerperDocuments(
        dependencies.client,
        dependencies.documentQueue,
        result.runId,
        now(),
      );
      dependencies.metrics.increment('documentsEnqueued', documentsEnqueued);
      const shadow = await calculateAndPersistShadowEligibility(dependencies.client, result.runId, now());
      dependencies.metrics.recordShadow(shadow.decision);
      dependencies.metrics.increment('jobsSucceeded');
      workerLog.info('Editorial verification job completed', {
        jobId: job.id,
        draftId: job.data.draftId,
        result,
        documentsEnqueued,
        shadow,
        durationMs: Date.now() - startedAt,
        metrics: dependencies.metrics.snapshot(),
      });
      return { ...result, documentsEnqueued, shadow };
    } catch (error) {
      if (error instanceof EditorialVerificationBudgetExceededError) {
        dependencies.metrics.increment('jobsDelayedByBudget');
        return delayJob(job, Math.max(1_000, error.resetAt.getTime() - now().getTime()), error.message);
      }
      dependencies.metrics.increment('jobsFailed');
      throw error;
    } finally {
      clearInterval(heartbeat);
      dependencies.metrics.recordDuration(Date.now() - startedAt);
      await lock.release().catch((error) => workerLog.warn('Failed to release editorial verification lock', { error: errorMessage(error) }));
    }
  };
}

function createBudgetedDependencies(dependencies: EditorialVerificationProcessorDependencies) {
  const baseMistral = dependencies.mistralAuditor ?? new MistralEditorialAuditor();
  const baseSourceHydrator = dependencies.sourceHydrator ?? new TrustScoreEditorialSourceHydrator();
  const baseSerper = dependencies.serperSearcher ?? searchSerperStrict;
  return {
    serperSearcher: async (...args: Parameters<typeof searchSerperStrict>) => {
      await dependencies.budget.consume('SERPER');
      dependencies.metrics.increment('serperRequests');
      dependencies.metrics.increment('estimatedCostMicros', dependencies.flags.serperEstimatedCostMicros);
      try {
        return await baseSerper(...args);
      } catch (error) {
        if (error instanceof EditorialVerificationBudgetExceededError) throw error;
        throw new RetryableEditorialVerificationDependencyError('SERPER', errorMessage(error));
      }
    },
    mistralAuditor: {
      model: baseMistral.model,
      audit: async (input: Parameters<EditorialMistralAuditor['audit']>[0]) => {
        await dependencies.budget.consume('MISTRAL');
        dependencies.metrics.increment('mistralRequests');
        dependencies.metrics.increment('estimatedCostMicros', dependencies.flags.mistralEstimatedCostMicros);
        try {
          const audit = await baseMistral.audit(input);
          if (audit.reasons.includes('MISTRAL_UNAVAILABLE') || audit.reasons.includes('MISTRAL_INVALID_JSON')) {
            throw new RetryableEditorialVerificationDependencyError('MISTRAL', audit.reasons.join(', '));
          }
          return audit;
        } catch (error) {
          if (error instanceof EditorialVerificationBudgetExceededError || error instanceof RetryableEditorialVerificationDependencyError) throw error;
          throw new RetryableEditorialVerificationDependencyError('MISTRAL', errorMessage(error));
        }
      },
    } satisfies EditorialMistralAuditor,
    sourceHydrator: {
      hydrate: async (...args: Parameters<EditorialVerificationSourceHydrator['hydrate']>) => {
        await dependencies.budget.consume('OPENAI');
        dependencies.metrics.increment('openaiRequests');
        dependencies.metrics.increment('estimatedCostMicros', dependencies.flags.openAIEstimatedCostMicros);
        try {
          return await baseSourceHydrator.hydrate(...args);
        } catch (error) {
          if (error instanceof EditorialVerificationBudgetExceededError) throw error;
          throw new RetryableEditorialVerificationDependencyError('OPENAI', errorMessage(error));
        }
      },
    } satisfies EditorialVerificationSourceHydrator,
  };
}

async function validateJob(client: PrismaClient, job: Job<EditorialVerificationJobData>): Promise<void> {
  const data = job.data;
  if (!data.draftId.trim() || !data.revisionId.trim() || !data.expectedContentHash.trim()) throw new UnrecoverableError('Editorial verification job identity fields are required');
  if (data.verificationVersion !== EDITORIAL_VERIFICATION_VERSION) throw new UnrecoverableError('Unsupported editorial verification version');
  if (Number.isNaN(new Date(data.requestedAt).getTime())) throw new UnrecoverableError('requestedAt must be a valid ISO date');
  if (job.id !== buildEditorialVerificationJobId(data)) throw new UnrecoverableError('Editorial verification job identity does not match its payload');
  const draft = await client.editorialDraft.findUnique({
    where: { id: data.draftId },
    select: { contentHash: true, currentRevisionId: true, article: { select: { status: true } } },
  });
  if (!draft?.article) throw new UnrecoverableError('Editorial verification draft or Article is missing');
  if (draft.article.status !== 'DRAFT') throw new UnrecoverableError('Editorial verification Article must remain DRAFT');
  if (draft.currentRevisionId !== data.revisionId || draft.contentHash !== data.expectedContentHash) {
    throw new UnrecoverableError('Editorial verification job targets a superseded revision');
  }
}

async function enqueueSerperDocuments(
  client: PrismaClient,
  queue: Pick<Queue<any>, 'add'>,
  runId: string,
  now: Date,
): Promise<number> {
  const run = await client.editorialVerificationRun.findUnique({ where: { id: runId }, select: { serperDocumentIds: true } });
  const documentIds = jsonStringArray(run?.serperDocumentIds ?? null);
  if (!documentIds.length) return 0;
  const documents = await client.ingestedDocument.findMany({
    where: {
      id: { in: documentIds },
      isIndexed: false,
      status: { in: ['DISCOVERED', 'FETCH_PENDING', 'FETCHED', 'EXTRACTED', 'PARTIAL', 'FAILED'] },
      accessPolicy: { notIn: ['BLOCKED', 'METADATA_ONLY'] },
      storagePolicy: { notIn: ['NONE', 'METADATA_ONLY'] },
    },
    select: { id: true },
  });
  for (const document of documents) {
    await enqueueDocumentJob(queue, {
      documentId: document.id,
      revision: DOCUMENT_REVISION,
      requestedAt: now.toISOString(),
      trigger: 'RETRY',
    });
  }
  return documents.length;
}

async function calculateAndPersistShadowEligibility(client: PrismaClient, runId: string, now: Date) {
  const run = await client.editorialVerificationRun.findUnique({
    where: { id: runId },
    include: {
      article: { select: { status: true, factCheckScore: true } },
      draft: {
        include: {
          qualityGate: true,
          brief: { include: { dossier: { include: { candidate: { include: { topic: true } } } } } },
        },
      },
    },
  });
  if (!run) throw new Error(`Editorial verification run not found: ${runId}`);
  const category = run.draft.brief.dossier.candidate.topic.dominantCategoryId
    ? await client.category.findUnique({ where: { id: run.draft.brief.dossier.candidate.topic.dominantCategoryId }, select: { slug: true } })
    : null;
  const audit = jsonRecord(run.mistralAudit);
  const corpus = jsonRecord(jsonRecord(run.corpusAssessment).final);
  const contradictions = Array.isArray(audit.contradictions) ? audit.contradictions.length : 0;
  const shadow = calculateEditorialShadowEligibility({
    verificationStatus: run.status,
    articleStatus: run.article.status,
    factCheckScore: run.article.factCheckScore,
    qualityScore: run.draft.qualityGate?.qualityScore ?? 0,
    publishabilityScore: run.draft.qualityGate?.publishabilityScore ?? 0,
    riskLevel: run.draft.brief.dossier.candidate.riskLevel,
    categorySlug: category?.slug,
    topicLabel: run.draft.brief.dossier.candidate.topic.label,
    independentDomains: numberValue(corpus.independentDomains),
    sourceCount: Array.isArray(run.sourceSnapshot) ? run.sourceSnapshot.length : 0,
    mistralPassed: audit.outcome === 'PASSED',
    contradictionCount: contradictions,
    gateReasons: jsonStringArray(run.gateReasons),
  });
  await client.editorialVerificationRun.update({
    where: { id: run.id },
    data: {
      shadowDecision: shadow.decision,
      shadowPolicyVersion: shadow.policyVersion,
      shadowReasons: shadow.reasons,
      shadowEvaluatedAt: now,
    },
  });
  return shadow;
}

async function markTerminalFailure(
  client: PrismaClient,
  job: Job<EditorialVerificationJobData>,
  error: Error,
  now: Date,
): Promise<void> {
  const run = await client.editorialVerificationRun.findFirst({
    where: { draftId: job.data.draftId, revisionId: job.data.revisionId, contentHash: job.data.expectedContentHash },
    orderBy: { createdAt: 'desc' },
    select: { id: true, articleId: true },
  });
  if (!run) return;
  const reason = `DEPENDENCY_RETRIES_EXHAUSTED:${error.message}`.slice(0, 1_000);
  await client.$transaction([
    client.editorialVerificationRun.update({
      where: { id: run.id },
      data: {
        status: 'HUMAN_REVIEW_REQUIRED',
        gateReasons: [reason],
        shadowDecision: 'WOULD_REQUIRE_HUMAN',
        shadowPolicyVersion: 'editorial-auto-publish-shadow-v1',
        shadowReasons: [reason],
        shadowEvaluatedAt: now,
        completedAt: now,
        leaseExpiresAt: null,
        error: reason,
      },
    }),
    client.article.updateMany({
      where: { id: run.articleId, status: 'DRAFT' },
      data: { factCheckStatus: 'FAILED', factCheckCompletedAt: now, factCheckError: reason },
    }),
  ]);
}

async function delayJob(job: Job<EditorialVerificationJobData>, delayMs: number, reason: string): Promise<never> {
  await job.moveToDelayed(Date.now() + delayMs, job.token);
  throw new DelayedError(reason);
}

function startHeartbeat(lock: { extend(ttlMs: number): Promise<boolean> }, ttlMs: number): NodeJS.Timeout {
  const timer = setInterval(() => lock.extend(ttlMs).catch((error) => workerLog.error('Failed to renew editorial verification lock', { error: errorMessage(error) })), Math.max(1_000, Math.floor(ttlMs / 3)));
  timer.unref();
  return timer;
}

export function isTerminalEditorialVerificationFailure(
  job: Pick<Job<EditorialVerificationJobData>, 'attemptsMade' | 'opts'>,
  error: Error,
): boolean {
  return error.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? EDITORIAL_VERIFICATION_JOB_ATTEMPTS);
}

export function buildEditorialVerificationDeadLetterData(
  job: Pick<Job<EditorialVerificationJobData>, 'id' | 'data' | 'attemptsMade'>,
  error: Error,
  failedAt = new Date(),
): EditorialVerificationDeadLetterData {
  return { ...job.data, originalJobId: job.id ?? null, failedAt: failedAt.toISOString(), attemptsMade: job.attemptsMade, error: error.message.slice(0, 1_000) };
}

export async function startEditorialVerificationWorker() {
  const flags = resolveEditorialVerificationRuntimeFlags();
  if (!flags.enabled || flags.killSwitch) {
    workerLog.warn('Editorial verification worker remains disabled', { enabled: flags.enabled, killSwitch: flags.killSwitch });
    return null;
  }
  const connection = createEditorialVerificationRedisConnection();
  const queues = createEditorialVerificationQueues(connection as unknown as ConnectionOptions);
  const documentQueues = createDocumentQueues(connection as unknown as ConnectionOptions);
  const metrics = new EditorialVerificationMetrics();
  const budget = new EditorialVerificationBudgetService(prisma, flags);
  const processor = createEditorialVerificationProcessor({
    client: prisma,
    redis: connection as unknown as DiscoveryRedis,
    flags,
    metrics,
    budget,
    documentQueue: documentQueues.documentQueue,
  });
  const worker = new Worker<EditorialVerificationJobData>(EDITORIAL_VERIFICATION_QUEUE_NAME, processor, {
    connection: connection as unknown as ConnectionOptions,
    concurrency: flags.workerConcurrency,
  });
  worker.on('completed', (job, result) => workerLog.info('Editorial verification completed', { jobId: job.id, draftId: job.data.draftId, result, metrics: metrics.snapshot() }));
  worker.on('failed', (job, error) => {
    if (!job || !isTerminalEditorialVerificationFailure(job, error)) return;
    const deadLetter = buildEditorialVerificationDeadLetterData(job, error);
    Promise.all([
      queues.deadLetterQueue.add(EDITORIAL_VERIFICATION_DLQ_JOB_NAME, deadLetter, { jobId: buildEditorialVerificationDeadLetterJobId(job.id, job.attemptsMade) }),
      markTerminalFailure(prisma, job, error, new Date()),
    ]).then(() => metrics.increment('jobsDeadLettered'))
      .catch((failure) => workerLog.error('Failed to dead-letter editorial verification', { jobId: job.id, error: errorMessage(failure) }));
  });
  worker.on('error', (error) => workerLog.error('Editorial verification worker error', { error: error.message }));
  let reconciling = false;
  const reconciliationTimer = setInterval(() => {
    if (reconciling) return;
    reconciling = true;
    reconcileEditorialVerificationRuns(prisma, queues.verificationQueue)
      .then((result) => {
        metrics.increment('reconciledRuns', result.staleRunsRecovered + result.indexedRunsRequeued);
        if (result.staleRunsRecovered || result.indexedRunsRequeued) workerLog.info('Editorial verification reconciliation complete', result);
      })
      .catch((error) => workerLog.error('Editorial verification reconciliation failed', { error: errorMessage(error) }))
      .finally(() => { reconciling = false; });
  }, flags.reconciliationIntervalMs);
  reconciliationTimer.unref();
  workerLog.info('Editorial verification worker started', { queue: EDITORIAL_VERIFICATION_QUEUE_NAME, concurrency: flags.workerConcurrency });
  return {
    worker, queues, documentQueues, metrics,
    async close() {
      clearInterval(reconciliationTimer);
      await worker.close();
      await queues.verificationQueue.close();
      await queues.deadLetterQueue.close();
      await documentQueues.documentQueue.close();
      await documentQueues.deadLetterQueue.close();
      await connection.quit();
    },
  };
}

function jsonStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
function jsonRecord(value: unknown): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
function numberValue(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startEditorialVerificationWorker().catch((error) => {
    workerLog.error('Editorial verification worker startup crashed', { error: errorMessage(error) });
    process.exit(1);
  });
}
