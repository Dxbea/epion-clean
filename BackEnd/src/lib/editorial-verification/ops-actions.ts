import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Job, Queue } from 'bullmq';
import type { EditorialShadowOpsFlags } from './ops-flags.js';
import { logger } from '../logger.js';
import { reconcileEditorialVerificationRuns } from './reconciliation.js';
import {
  enqueueEditorialVerificationJob,
  prepareEditorialVerificationJob,
  type EditorialVerificationDeadLetterData,
  type EditorialVerificationJobData,
} from './verification-queue.js';

const opsLog = logger.child({ module: 'EditorialShadowOpsActions' });

export interface EditorialOpsActionQueues {
  verificationQueue: Pick<Queue<EditorialVerificationJobData>, 'add'>;
  deadLetterQueue: Pick<Queue<EditorialVerificationDeadLetterData>, 'getJob'>;
}

export interface EditorialOpsActionInput {
  actorUserId: string;
  expectedContentHash: string;
  reason: string;
  idempotencyKey: string;
}

export class EditorialOpsActionBlockedError extends Error {
  readonly status: number;
  constructor(readonly code: string, message: string, status = 409) {
    super(message);
    this.name = 'EditorialOpsActionBlockedError';
    this.status = status;
  }
}

export async function replayEditorialVerificationRun(
  client: PrismaClient,
  queue: EditorialOpsActionQueues['verificationQueue'],
  flags: EditorialShadowOpsFlags,
  runId: string,
  input: EditorialOpsActionInput,
  now = new Date(),
) {
  ensureMutationsEnabled(flags);
  const operationKey = hashOperation('RUN_REPLAY', input.idempotencyKey);
  const existing = await findOperation(client, operationKey);
  if (existing) return existingResult(existing);
  const run = await client.editorialVerificationRun.findUnique({
    where: { id: runId },
    include: { draft: true, article: { select: { id: true, status: true } } },
  });
  if (!run) throw new EditorialOpsActionBlockedError('EDITORIAL_VERIFICATION_RUN_NOT_FOUND', 'Editorial verification run not found', 404);
  validateCurrentRun(run, input.expectedContentHash);
  const data = prepareEditorialVerificationJob({
    draftId: run.draftId, revisionId: run.revisionId, expectedContentHash: run.contentHash,
    trigger: 'RECONCILIATION', requestedAt: now,
  });
  const jobId = await enqueueEditorialVerificationJob(queue, data);
  const audit = await createOperationAudit(client, {
    operationKey, action: 'VERIFICATION_REPLAYED', run, actorUserId: input.actorUserId,
    reason: input.reason, details: { runId, jobId, trigger: 'ADMIN_REPLAY' },
  });
  opsLog.info('Editorial verification replay queued', { runId, jobId, auditId: audit.id });
  return { outcome: 'VERIFICATION_REPLAY_QUEUED', runId, jobId, auditId: audit.id, idempotent: false };
}

export async function replayEditorialVerificationDlqJob(
  client: PrismaClient,
  queues: EditorialOpsActionQueues,
  flags: EditorialShadowOpsFlags,
  dlqJobId: string,
  input: EditorialOpsActionInput,
  now = new Date(),
) {
  ensureMutationsEnabled(flags);
  const operationKey = hashOperation('DLQ_REPLAY', input.idempotencyKey);
  const existing = await findOperation(client, operationKey);
  if (existing) {
    const staleDlqJob = await queues.deadLetterQueue.getJob(dlqJobId) as Job<EditorialVerificationDeadLetterData> | undefined;
    await staleDlqJob?.remove();
    return existingResult(existing);
  }
  const dlqJob = await queues.deadLetterQueue.getJob(dlqJobId) as Job<EditorialVerificationDeadLetterData> | undefined;
  if (!dlqJob) throw new EditorialOpsActionBlockedError('EDITORIAL_DLQ_JOB_NOT_FOUND', 'Editorial verification DLQ job not found', 404);
  const run = await client.editorialVerificationRun.findFirst({
    where: { draftId: dlqJob.data.draftId, revisionId: dlqJob.data.revisionId, contentHash: dlqJob.data.expectedContentHash },
    orderBy: { createdAt: 'desc' },
    include: { draft: true, article: { select: { id: true, status: true } } },
  });
  if (!run) throw new EditorialOpsActionBlockedError('EDITORIAL_DLQ_RUN_NOT_FOUND', 'No verification run matches the DLQ job', 404);
  validateCurrentRun(run, input.expectedContentHash);
  const data = prepareEditorialVerificationJob({
    draftId: run.draftId, revisionId: run.revisionId, expectedContentHash: run.contentHash,
    trigger: 'RECONCILIATION', requestedAt: now,
  });
  const jobId = await enqueueEditorialVerificationJob(queues.verificationQueue, data);
  const audit = await createOperationAudit(client, {
    operationKey, action: 'VERIFICATION_DLQ_REPLAYED', run, actorUserId: input.actorUserId,
    reason: input.reason, details: { runId: run.id, dlqJobId, jobId, trigger: 'ADMIN_DLQ_REPLAY' },
  });
  await dlqJob.remove();
  opsLog.info('Editorial verification DLQ replay queued', { runId: run.id, dlqJobId, jobId, auditId: audit.id });
  return { outcome: 'VERIFICATION_DLQ_REPLAY_QUEUED', runId: run.id, jobId, auditId: audit.id, idempotent: false };
}

export async function reconcileEditorialVerificationRun(
  client: PrismaClient,
  queue: EditorialOpsActionQueues['verificationQueue'],
  flags: EditorialShadowOpsFlags,
  runId: string,
  input: EditorialOpsActionInput,
  now = new Date(),
) {
  ensureMutationsEnabled(flags);
  const operationKey = hashOperation('RUN_RECONCILE', input.idempotencyKey);
  const existing = await findOperation(client, operationKey);
  if (existing) return existingResult(existing);
  const run = await client.editorialVerificationRun.findUnique({
    where: { id: runId },
    include: { draft: true, article: { select: { id: true, status: true } } },
  });
  if (!run) throw new EditorialOpsActionBlockedError('EDITORIAL_VERIFICATION_RUN_NOT_FOUND', 'Editorial verification run not found', 404);
  validateCurrentRun(run, input.expectedContentHash);
  const result = await reconcileEditorialVerificationRuns(client, queue, { now, limit: 1, runId });
  if (result.staleRunsRecovered + result.indexedRunsRequeued !== 1) {
    throw new EditorialOpsActionBlockedError('EDITORIAL_RUN_NOT_RECONCILABLE', 'Run is not expired or awaiting indexed Serper evidence');
  }
  const audit = await createOperationAudit(client, {
    operationKey, action: 'VERIFICATION_RECONCILED', run, actorUserId: input.actorUserId,
    reason: input.reason, details: { runId, result, trigger: 'ADMIN_RECONCILIATION' },
  });
  opsLog.info('Editorial verification run reconciled', { runId, auditId: audit.id, result });
  return { outcome: 'VERIFICATION_RECONCILED', runId, result, auditId: audit.id, idempotent: false };
}

function ensureMutationsEnabled(flags: EditorialShadowOpsFlags): void {
  if (!flags.calibrationEnabled || !flags.mutationsEnabled || flags.killSwitch) {
    throw new EditorialOpsActionBlockedError('EDITORIAL_SHADOW_OPS_DISABLED', 'Editorial shadow operations are disabled', 503);
  }
}

function validateCurrentRun(run: any, expectedContentHash: string): void {
  if (run.article.status !== 'DRAFT') throw new EditorialOpsActionBlockedError('EDITORIAL_ARTICLE_NOT_DRAFT', 'Only Article DRAFT verification can be replayed');
  if (run.contentHash !== expectedContentHash || run.draft.contentHash !== expectedContentHash) throw new EditorialOpsActionBlockedError('EDITORIAL_CONTENT_HASH_MISMATCH', 'Editorial content hash changed');
  if (run.draft.currentRevisionId !== run.revisionId) throw new EditorialOpsActionBlockedError('EDITORIAL_REVISION_SUPERSEDED', 'Editorial revision is no longer current');
}

async function createOperationAudit(client: PrismaClient, input: {
  operationKey: string;
  action: 'VERIFICATION_REPLAYED' | 'VERIFICATION_DLQ_REPLAYED' | 'VERIFICATION_RECONCILED';
  run: any;
  actorUserId: string;
  reason: string;
  details: Record<string, unknown>;
}) {
  try {
    return await client.editorialReviewAuditLog.create({
      data: {
        operationKey: input.operationKey, draftId: input.run.draftId, revisionId: input.run.revisionId,
        articleId: input.run.articleId, actorUserId: input.actorUserId, action: input.action,
        contentHash: input.run.contentHash, previousStatus: input.run.draft.status,
        resultingStatus: input.run.draft.status, reviewNote: input.reason.trim(),
        details: input.details as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await findOperation(client, input.operationKey);
      if (existing) return existing;
    }
    throw error;
  }
}

async function findOperation(client: PrismaClient, operationKey: string) {
  return client.editorialReviewAuditLog.findUnique({ where: { operationKey } });
}

function existingResult(audit: any) {
  const details = audit.details && typeof audit.details === 'object' && !Array.isArray(audit.details) ? audit.details : {};
  return { outcome: 'ALREADY_REPLAYED', runId: details.runId ?? null, jobId: details.jobId ?? null, auditId: audit.id, idempotent: true };
}

function hashOperation(action: string, key: string): string {
  return createHash('sha256').update(`${action}:${key.trim()}`).digest('hex');
}
