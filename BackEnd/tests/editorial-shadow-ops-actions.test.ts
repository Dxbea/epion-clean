import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { resolveEditorialShadowOpsFlags } from '../src/lib/editorial-verification/ops-flags.js';
import {
  reconcileEditorialVerificationRun,
  replayEditorialVerificationDlqJob,
  replayEditorialVerificationRun,
} from '../src/lib/editorial-verification/ops-actions.js';

const enabledFlags = resolveEditorialShadowOpsFlags({
  EDITORIAL_SHADOW_CALIBRATION_ENABLED: 'true',
  EDITORIAL_SHADOW_OPS_MUTATIONS_ENABLED: 'true',
  EDITORIAL_SHADOW_OPS_KILL_SWITCH: 'false',
});
const input = {
  actorUserId: 'admin-1', expectedContentHash: 'hash-1',
  reason: 'Replay contrôlé après vérification opérationnelle.', idempotencyKey: 'request-key-0001',
};
const run = {
  id: 'run-1', draftId: 'draft-1', revisionId: 'revision-1', articleId: 'article-1', contentHash: 'hash-1',
  draft: { status: 'ARTICLE_DRAFT_CREATED', contentHash: 'hash-1', currentRevisionId: 'revision-1' },
  article: { id: 'article-1', status: 'DRAFT' },
};

describe('controlled editorial shadow operations', () => {
  it('replays a current DRAFT run with deterministic queueing and audit', async () => {
    const add = vi.fn().mockResolvedValue({});
    const create = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const client = {
      editorialVerificationRun: { findUnique: vi.fn().mockResolvedValue(run) },
      editorialReviewAuditLog: { findUnique: vi.fn().mockResolvedValue(null), create },
      article: { update: vi.fn(), updateMany: vi.fn() },
    } as unknown as PrismaClient;
    await expect(replayEditorialVerificationRun(client, { add } as never, enabledFlags, 'run-1', input, new Date('2026-07-20T10:00:00Z')))
      .resolves.toMatchObject({ outcome: 'VERIFICATION_REPLAY_QUEUED', runId: 'run-1', auditId: 'audit-1' });
    expect(add).toHaveBeenCalledWith('verify-editorial-draft', expect.objectContaining({ trigger: 'RECONCILIATION' }), expect.objectContaining({ jobId: expect.any(String) }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'VERIFICATION_REPLAYED', actorUserId: 'admin-1' }) }));
    expect((client.article.update as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((client.article.updateMany as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('returns the prior audit for an idempotent retry without touching the queue', async () => {
    const add = vi.fn();
    const client = {
      editorialReviewAuditLog: { findUnique: vi.fn().mockResolvedValue({ id: 'audit-existing', details: { runId: 'run-1', jobId: 'job-1' } }) },
    } as unknown as PrismaClient;
    await expect(replayEditorialVerificationRun(client, { add } as never, enabledFlags, 'run-1', input))
      .resolves.toEqual({ outcome: 'ALREADY_REPLAYED', runId: 'run-1', jobId: 'job-1', auditId: 'audit-existing', idempotent: true });
    expect(add).not.toHaveBeenCalled();
  });

  it('blocks every mutation unless calibration and mutation flags are explicitly enabled', async () => {
    const disabled = resolveEditorialShadowOpsFlags({});
    const client = { editorialReviewAuditLog: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as PrismaClient;
    await expect(replayEditorialVerificationRun(client, { add: vi.fn() } as never, disabled, 'run-1', input))
      .rejects.toMatchObject({ code: 'EDITORIAL_SHADOW_OPS_DISABLED', status: 503 });
  });

  it('replays and removes a DLQ job only after a durable audit is recorded', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const add = vi.fn().mockResolvedValue({});
    const client = {
      editorialReviewAuditLog: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'audit-dlq' }) },
      editorialVerificationRun: { findFirst: vi.fn().mockResolvedValue(run) },
    } as unknown as PrismaClient;
    const queues = {
      verificationQueue: { add },
      deadLetterQueue: { getJob: vi.fn().mockResolvedValue({ data: { draftId: 'draft-1', revisionId: 'revision-1', expectedContentHash: 'hash-1' }, remove }) },
    };
    await expect(replayEditorialVerificationDlqJob(client, queues as never, enabledFlags, 'dlq-1', input))
      .resolves.toMatchObject({ outcome: 'VERIFICATION_DLQ_REPLAY_QUEUED', auditId: 'audit-dlq' });
    expect(remove).toHaveBeenCalledOnce();
  });

  it('finishes DLQ cleanup when an idempotent response follows a partial prior success', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const client = {
      editorialReviewAuditLog: { findUnique: vi.fn().mockResolvedValue({ id: 'audit-existing', details: { runId: 'run-1', jobId: 'job-1' } }) },
    } as unknown as PrismaClient;
    const queues = { verificationQueue: { add: vi.fn() }, deadLetterQueue: { getJob: vi.fn().mockResolvedValue({ remove }) } };
    await expect(replayEditorialVerificationDlqJob(client, queues as never, enabledFlags, 'dlq-1', input))
      .resolves.toMatchObject({ outcome: 'ALREADY_REPLAYED', idempotent: true });
    expect(remove).toHaveBeenCalledOnce();
    expect(queues.verificationQueue.add).not.toHaveBeenCalled();
  });

  it('reconciles one expired run, enqueues it and records the admin action', async () => {
    const add = vi.fn().mockResolvedValue({});
    const create = vi.fn().mockResolvedValue({ id: 'audit-reconcile' });
    const client = {
      editorialVerificationRun: {
        findUnique: vi.fn().mockResolvedValue(run),
        findMany: vi.fn().mockResolvedValue([{ ...run, status: 'RUNNING', leaseExpiresAt: new Date('2026-07-20T09:00:00Z') }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      editorialReviewAuditLog: { findUnique: vi.fn().mockResolvedValue(null), create },
      ingestedDocument: { count: vi.fn() },
    } as unknown as PrismaClient;
    await expect(reconcileEditorialVerificationRun(client, { add } as never, enabledFlags, 'run-1', input, new Date('2026-07-20T10:00:00Z')))
      .resolves.toMatchObject({ outcome: 'VERIFICATION_RECONCILED', auditId: 'audit-reconcile' });
    expect(add).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'VERIFICATION_RECONCILED' }) }));
  });
});
