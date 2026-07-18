import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { reconcileEditorialVerificationRuns } from '../src/lib/editorial-verification/reconciliation.js';

describe('editorial verification reconciliation', () => {
  it('recovers expired runs and requeues fully indexed Serper evidence idempotently', async () => {
    const common = {
      draftId: 'draft-1', revisionId: 'revision-1', contentHash: 'hash-1',
      draft: { currentRevisionId: 'revision-1', contentHash: 'hash-1' }, article: { status: 'DRAFT' },
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      editorialVerificationRun: {
        findMany: vi.fn().mockResolvedValue([
          { ...common, id: 'run-stale', status: 'RUNNING', serperDocumentIds: null },
          {
            ...common, id: 'run-indexed', status: 'HUMAN_REVIEW_REQUIRED',
            gateReasons: ['CORE_CLAIM_ONLY_METADATA_EVIDENCE'], serperDocumentIds: ['doc-1', 'doc-2'],
          },
        ]),
        updateMany,
      },
      ingestedDocument: { count: vi.fn().mockResolvedValue(2) },
    } as unknown as PrismaClient;
    const queue = { add: vi.fn().mockResolvedValue({}) };
    const result = await reconcileEditorialVerificationRuns(client, queue as never, {
      now: new Date('2026-07-18T12:00:00Z'),
    });
    expect(result).toEqual({ inspected: 2, staleRunsRecovered: 1, indexedRunsRequeued: 1 });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add.mock.calls.every((call) => call[2].jobId === queue.add.mock.calls[0][2].jobId)).toBe(true);
  });

  it('never requeues a published Article or superseded revision', async () => {
    const client = {
      editorialVerificationRun: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'run-1', status: 'RUNNING', draftId: 'draft-1', revisionId: 'old', contentHash: 'old-hash',
          draft: { currentRevisionId: 'new', contentHash: 'new-hash' }, article: { status: 'PUBLISHED' },
        }]),
        updateMany: vi.fn(),
      },
    } as unknown as PrismaClient;
    const queue = { add: vi.fn() };
    await expect(reconcileEditorialVerificationRuns(client, queue as never)).resolves.toMatchObject({ staleRunsRecovered: 0 });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not loop forever on human-review reasons unrelated to extraction', async () => {
    const client = {
      editorialVerificationRun: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'run-1', status: 'HUMAN_REVIEW_REQUIRED', draftId: 'draft-1', revisionId: 'revision-1', contentHash: 'hash-1',
          gateReasons: ['MISTRAL_CONTRADICTION_PRESENT'], serperDocumentIds: ['doc-1'],
          draft: { currentRevisionId: 'revision-1', contentHash: 'hash-1' }, article: { status: 'DRAFT' },
        }]),
      },
      ingestedDocument: { count: vi.fn() },
    } as unknown as PrismaClient;
    const queue = { add: vi.fn() };
    await reconcileEditorialVerificationRuns(client, queue as never);
    expect(queue.add).not.toHaveBeenCalled();
    expect((client.ingestedDocument.count as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
