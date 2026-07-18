import { Prisma, type PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  enqueueEditorialVerificationJob,
  prepareEditorialVerificationJob,
  type EditorialVerificationJobData,
} from './verification-queue.js';

export interface EditorialVerificationReconciliationResult {
  inspected: number;
  staleRunsRecovered: number;
  indexedRunsRequeued: number;
}

export async function reconcileEditorialVerificationRuns(
  client: PrismaClient,
  queue: Pick<Queue<EditorialVerificationJobData>, 'add'>,
  options: { now?: Date; limit?: number; runId?: string } = {},
): Promise<EditorialVerificationReconciliationResult> {
  const now = options.now ?? new Date();
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));
  const runs = await client.editorialVerificationRun.findMany({
    where: {
      ...(options.runId ? { id: options.runId } : {}),
      OR: [
        { status: 'RUNNING', leaseExpiresAt: { lt: now } },
        { status: 'HUMAN_REVIEW_REQUIRED', serperRequired: true },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    include: {
      draft: { select: { contentHash: true, currentRevisionId: true } },
      article: { select: { status: true } },
    },
  });
  let staleRunsRecovered = 0;
  let indexedRunsRequeued = 0;
  for (const run of runs) {
    if (run.article.status !== 'DRAFT' || run.draft.currentRevisionId !== run.revisionId || run.draft.contentHash !== run.contentHash) continue;
    if (run.status === 'RUNNING') {
      const released = await client.editorialVerificationRun.updateMany({
        where: { id: run.id, status: 'RUNNING', leaseExpiresAt: { lt: now } },
        data: { status: 'FAILED', leaseExpiresAt: null, error: 'RECONCILED_EXPIRED_RUN' },
      });
      if (released.count !== 1) continue;
      await enqueueRun(queue, run, now);
      staleRunsRecovered++;
      continue;
    }
    if (!jsonStringArray(run.gateReasons).includes('CORE_CLAIM_ONLY_METADATA_EVIDENCE')) continue;
    const documentIds = jsonStringArray(run.serperDocumentIds);
    if (!documentIds.length) continue;
    const indexed = await client.ingestedDocument.count({
      where: { id: { in: documentIds }, status: 'INDEXED', isIndexed: true },
    });
    if (indexed !== documentIds.length) continue;
    await enqueueRun(queue, run, now);
    indexedRunsRequeued++;
  }
  return { inspected: runs.length, staleRunsRecovered, indexedRunsRequeued };
}

async function enqueueRun(
  queue: Pick<Queue<EditorialVerificationJobData>, 'add'>,
  run: { draftId: string; revisionId: string; contentHash: string },
  now: Date,
): Promise<void> {
  await enqueueEditorialVerificationJob(queue, prepareEditorialVerificationJob({
    draftId: run.draftId,
    revisionId: run.revisionId,
    expectedContentHash: run.contentHash,
    trigger: 'RECONCILIATION',
    requestedAt: now,
  }));
}

function jsonStringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
