import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { materializeQualityGateArticleDraft } from '../editorial-draft/quality-gate-materializer.js';
import { resolveEditorialValidationMode } from '../editorial-draft/validation-mode.js';
import {
  createEditorialVerificationQueues,
  createEditorialVerificationRedisConnection,
  enqueueEditorialVerificationJob,
  prepareEditorialVerificationJob,
  type EditorialVerificationJobData,
} from './verification-queue.js';

export interface EnqueueEditorialVerificationResult {
  draftId: string;
  revisionId: string;
  articleId: string;
  jobId: string;
  outcome: 'VERIFICATION_QUEUED';
}

export async function enqueueEditorialVerificationForDraft(
  client: PrismaClient,
  input: { draftId: string; expectedContentHash: string },
  options: { queue?: Pick<Queue<EditorialVerificationJobData>, 'add'>; now?: Date } = {},
): Promise<EnqueueEditorialVerificationResult> {
  const validationMode = resolveEditorialValidationMode();
  if (validationMode === 'quality_gate') {
    await materializeQualityGateArticleDraft(client, input.draftId);
  }
  const draft = await client.editorialDraft.findUnique({
    where: { id: input.draftId },
    select: {
      id: true, contentHash: true, currentRevisionId: true,
      currentRevision: { select: { id: true, contentHash: true } },
      qualityGate: { select: { automatedDecision: true, humanReviewStatus: true } },
      article: { select: { id: true, status: true } },
    },
  });
  if (!draft?.article || !draft.currentRevision || !draft.contentHash || !draft.currentRevisionId) {
    throw new Error('Editorial verification enqueue requires an approved Article DRAFT');
  }
  if (draft.article.status !== 'DRAFT') throw new Error('Editorial verification enqueue only accepts Article DRAFT');
  if (draft.contentHash !== input.expectedContentHash || draft.currentRevision.contentHash !== input.expectedContentHash) {
    throw new Error('Editorial verification enqueue content hash mismatch');
  }
  if (draft.qualityGate?.automatedDecision !== 'PASSED' || (validationMode === 'human_review' && draft.qualityGate.humanReviewStatus !== 'APPROVED')) {
    throw new Error(validationMode === 'quality_gate'
      ? 'Editorial verification enqueue requires a passed quality gate'
      : 'Editorial verification enqueue requires automated and human approval gates');
  }
  const data = prepareEditorialVerificationJob({
    draftId: draft.id,
    revisionId: draft.currentRevisionId,
    expectedContentHash: input.expectedContentHash,
    trigger: 'ADMIN',
    requestedAt: options.now,
  });
  if (options.queue) {
    const jobId = await enqueueEditorialVerificationJob(options.queue, data);
    return { draftId: draft.id, revisionId: draft.currentRevisionId, articleId: draft.article.id, jobId, outcome: 'VERIFICATION_QUEUED' };
  }
  const connection = createEditorialVerificationRedisConnection();
  const queues = createEditorialVerificationQueues(connection as unknown as ConnectionOptions);
  try {
    const jobId = await enqueueEditorialVerificationJob(queues.verificationQueue, data);
    return { draftId: draft.id, revisionId: draft.currentRevisionId, articleId: draft.article.id, jobId, outcome: 'VERIFICATION_QUEUED' };
  } finally {
    await queues.verificationQueue.close();
    await queues.deadLetterQueue.close();
    await connection.quit();
  }
}
