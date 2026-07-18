import type { PrismaClient } from '@prisma/client';
import type { Job, Queue } from 'bullmq';
import type { EditorialShadowOpsFlags } from './ops-flags.js';
import type { EditorialVerificationRuntimeFlags } from './runtime-flags.js';
import type { EditorialVerificationDeadLetterData, EditorialVerificationJobData } from './verification-queue.js';
import { logger } from '../logger.js';

const opsLog = logger.child({ module: 'EditorialShadowOps' });

export interface EditorialOpsQueues {
  verificationQueue: Pick<Queue<EditorialVerificationJobData>, 'getJobCounts' | 'getJobs'>;
  deadLetterQueue: Pick<Queue<EditorialVerificationDeadLetterData>, 'getJobCounts' | 'getJobs'>;
}

export async function listEditorialVerificationRuns(
  client: PrismaClient,
  input: { status?: string; shadowDecision?: string; cursor?: string; limit?: number } = {},
) {
  const limit = bounded(input.limit, 25, 100);
  const rows = await client.editorialVerificationRun.findMany({
    where: {
      ...(input.status ? { status: input.status as any } : {}),
      ...(input.shadowDecision ? { shadowDecision: input.shadowDecision as any } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    include: {
      article: { select: { id: true, title: true, slug: true, status: true, factCheckStatus: true, factCheckScore: true } },
      draft: { select: { id: true, title: true, status: true, currentRevisionId: true, contentHash: true } },
    },
  });
  const hasMore = rows.length > limit;
  const runs = hasMore ? rows.slice(0, limit) : rows;
  return { runs, nextCursor: hasMore ? runs[runs.length - 1]?.id ?? null : null };
}

export async function listEditorialVerificationBudgets(client: PrismaClient, days = 14) {
  const usage = await client.editorialVerificationDailyUsage.findMany({
    orderBy: { day: 'desc' },
    take: bounded(days, 14, 90),
  });
  return { usage };
}

export async function listPendingEditorialSerperDocuments(client: PrismaClient, limit = 50) {
  const documents = await client.ingestedDocument.findMany({
    where: {
      discoveries: { some: { discoverySource: { key: 'internal-editorial-serper' } } },
      OR: [{ isIndexed: false }, { status: { not: 'INDEXED' } }],
    },
    orderBy: { updatedAt: 'asc' },
    take: bounded(limit, 50, 200),
    select: {
      id: true, canonicalUrl: true, domain: true, title: true, status: true, accessPolicy: true,
      storagePolicy: true, fetchAttempts: true, fetchError: true, discoveredAt: true, updatedAt: true,
      isIndexed: true, indexedAt: true,
    },
  });
  return { documents };
}

export async function getEditorialQueueSnapshot(queues: EditorialOpsQueues, now = new Date()) {
  const [verificationCounts, dlqCounts, jobs, dlqJobs] = await Promise.all([
    queues.verificationQueue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'paused'),
    queues.deadLetterQueue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
    queues.verificationQueue.getJobs(['waiting', 'active', 'delayed', 'failed'], 0, 49, true),
    queues.deadLetterQueue.getJobs(['waiting', 'active', 'failed', 'completed'], 0, 49, true),
  ]);
  const blockedJobs = jobs.map(publicJob).filter((job) => job.state !== 'active' || now.getTime() - job.timestamp > 5 * 60_000);
  return {
    verificationCounts,
    dlqCounts,
    blockedJobs,
    dlq: dlqJobs.map(publicJob),
    oldestPendingAt: jobs.length ? new Date(Math.min(...jobs.map((job) => job.timestamp))).toISOString() : null,
  };
}

export async function getEditorialCalibrationSummary(client: PrismaClient, since: Date) {
  const runs = await client.editorialVerificationRun.findMany({
    where: { shadowEvaluatedAt: { gte: since } },
    select: { shadowDecision: true, shadowReasons: true, gateReasons: true, status: true },
  });
  const decisions: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  const statuses: Record<string, number> = {};
  for (const run of runs) {
    increment(decisions, run.shadowDecision ?? 'NOT_EVALUATED');
    increment(statuses, run.status);
    for (const reason of [...jsonStrings(run.shadowReasons), ...jsonStrings(run.gateReasons)]) increment(reasons, reason);
  }
  return {
    since: since.toISOString(), totalRuns: runs.length, decisions, statuses,
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
  };
}

export async function buildEditorialOperationalAlerts(input: {
  client: PrismaClient;
  queues: EditorialOpsQueues;
  opsFlags: EditorialShadowOpsFlags;
  runtimeFlags: EditorialVerificationRuntimeFlags;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [usage, recentRuns, pendingDocuments, queue] = await Promise.all([
    input.client.editorialVerificationDailyUsage.findUnique({ where: { day } }),
    input.client.editorialVerificationRun.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } },
      select: { status: true, gateReasons: true, error: true },
    }),
    input.client.ingestedDocument.count({
      where: {
        discoveries: { some: { discoverySource: { key: 'internal-editorial-serper' } } },
        OR: [{ isIndexed: false }, { status: { not: 'INDEXED' } }],
      },
    }),
    getEditorialQueueSnapshot(input.queues, now),
  ]);
  const alerts: Array<{ code: string; severity: 'WARNING' | 'CRITICAL'; value: number | string; message: string }> = [];
  const budgetRatios = usage ? [
    ratio(usage.verificationCount, input.runtimeFlags.maxVerificationsPerDay),
    ratio(usage.serperRequestCount, input.runtimeFlags.maxSerperRequestsPerDay),
    ratio(usage.mistralRequestCount, input.runtimeFlags.maxMistralRequestsPerDay),
    ratio(usage.openaiRequestCount, input.runtimeFlags.maxOpenAIRequestsPerDay),
    ratio(usage.estimatedCostMicros, input.runtimeFlags.maxEstimatedCostMicrosPerDay),
  ] : [0];
  const maxBudgetRatio = Math.max(...budgetRatios);
  if (maxBudgetRatio >= input.opsFlags.budgetWarningRatio) alerts.push(alert('BUDGET_NEAR_LIMIT', maxBudgetRatio >= 1 ? 'CRITICAL' : 'WARNING', maxBudgetRatio, 'Daily editorial verification budget is near its limit'));
  const failClosed = recentRuns.filter((run) => run.status === 'HUMAN_REVIEW_REQUIRED' || run.status === 'FAILED').length;
  const failClosedRatio = ratio(failClosed, recentRuns.length);
  if (recentRuns.length >= 5 && failClosedRatio >= input.opsFlags.failClosedWarningRatio) alerts.push(alert('FAIL_CLOSED_RATE_HIGH', 'WARNING', failClosedRatio, 'Editorial fail-closed rate is above the configured threshold'));
  const dependencyReasons = recentRuns.flatMap((run) => [...jsonStrings(run.gateReasons), ...(run.error ? [run.error] : [])]);
  for (const provider of ['SERPER', 'MISTRAL'] as const) {
    const failures = dependencyReasons.filter((reason) => reason.includes(provider)).length;
    if (failures > 0) alerts.push(alert(`${provider}_UNAVAILABLE`, 'WARNING', failures, `${provider} failures require attention`));
  }
  if (pendingDocuments >= input.opsFlags.pendingDocumentsWarningCount) alerts.push(alert('SERPER_DOCUMENTS_PENDING', 'WARNING', pendingDocuments, 'Serper documents are waiting for extraction or indexing'));
  const backlog = count(queue.verificationCounts.waiting) + count(queue.verificationCounts.delayed);
  if (backlog >= input.opsFlags.queueBacklogWarningCount) alerts.push(alert('QUEUE_BACKLOG', 'WARNING', backlog, 'Editorial verification queue backlog is high'));
  if (queue.oldestPendingAt && now.getTime() - new Date(queue.oldestPendingAt).getTime() >= input.opsFlags.oldestJobWarningMs) alerts.push(alert('QUEUE_STALLED', 'CRITICAL', queue.oldestPendingAt, 'Old editorial verification jobs appear stalled'));
  const dlqCount = Object.values(queue.dlqCounts).reduce((sum, value) => sum + count(value), 0);
  if (dlqCount > 0) alerts.push(alert('DLQ_NOT_EMPTY', 'CRITICAL', dlqCount, 'Editorial verification dead-letter queue is not empty'));
  if (alerts.length > 0) opsLog.warn('Editorial shadow operational alerts detected', {
    alertCodes: alerts.map((item) => item.code), criticalCount: alerts.filter((item) => item.severity === 'CRITICAL').length,
  });
  return { generatedAt: now.toISOString(), alerts, queue, usage, pendingDocuments, recentRuns: recentRuns.length, failClosedRatio };
}

function publicJob(job: Job<any>) {
  return { id: job.id ?? null, name: job.name, data: job.data, attemptsMade: job.attemptsMade, timestamp: job.timestamp, processedOn: job.processedOn ?? null, failedReason: job.failedReason ?? null, state: job.processedOn ? 'active' : 'pending' };
}
function bounded(value: number | undefined, fallback: number, max: number): number { return Number.isInteger(value) && value! >= 1 ? Math.min(value!, max) : fallback; }
function jsonStrings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function increment(target: Record<string, number>, key: string): void { target[key] = (target[key] ?? 0) + 1; }
function ratio(value: number, limit: number): number { return limit > 0 ? value / limit : value > 0 ? 1 : 0; }
function count(value: unknown): number { return typeof value === 'number' ? value : 0; }
function alert(code: string, severity: 'WARNING' | 'CRITICAL', value: number | string, message: string) { return { code, severity, value, message }; }
