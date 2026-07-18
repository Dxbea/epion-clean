import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { buildEditorialDraftIdempotencyKey, generateControlledEditorialDraft, resolveEditorialDraftConfig } from '../src/lib/editorial-draft/draft-service.js';
import type { EditorialClaimCritic, EditorialDraftGenerator } from '../src/lib/editorial-draft/types.js';
import { draftEvidence, validArtifact } from './fixtures/editorial/draft.js';

function briefSource() {
  return {
    id: 'brief-1', shadowOnly: true, contentHash: 'brief-hash',
    structuredContent: { schemaVersion: 1, audit: { dossierId: 'dossier-1', evidenceHash: 'evidence-hash' } },
    dossier: {
      id: 'dossier-1', status: 'COMPLETED', shadowOnly: true, evidenceHash: 'evidence-hash',
      evidence: draftEvidence.map((item, index) => ({ id: `brief-evidence-${index + 1}`, ...item })),
      candidate: { shadowOnly: true, riskLevel: 'MEDIUM' },
    },
  };
}

const reviews = validArtifact.claims.map((claim) => ({ claimKey: claim.claimKey, verdict: 'SUPPORTED', explanation: 'Directly supported.', evidenceKeys: claim.evidenceKeys }));

describe('controlled editorial draft service', () => {
  it('generates, criticizes and persists a reviewable artifact without creating Article', async () => {
    const generator: EditorialDraftGenerator = { model: 'generator-test', generate: vi.fn(async () => ({ artifact: validArtifact, inputTokens: 100, outputTokens: 50, estimatedCostMicros: 3 })) };
    const critic: EditorialClaimCritic = { model: 'critic-test', review: vi.fn(async () => ({ reviews, inputTokens: 50, outputTokens: 20, estimatedCostMicros: 2 })) };
    const transaction = {
      editorialDraftClaim: { deleteMany: vi.fn(async () => ({ count: 0 })), createMany: vi.fn(async () => ({ count: 2 })) },
      editorialDraftClaimEvidence: { createMany: vi.fn(async () => ({ count: 3 })) },
      editorialQualityGate: { upsert: vi.fn(async () => ({})) },
      editorialDraftRevision: { create: vi.fn(async () => ({})) },
      editorialDraft: { update: vi.fn(async () => ({})) },
      article: { create: vi.fn() },
    };
    const client = {
      editorialBrief: { findUnique: vi.fn(async () => briefSource()) },
      editorialDraft: {
        createMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => ({ id: 'draft-1', briefId: 'brief-1', status: 'PENDING', claims: [], qualityGate: null, metrics: null })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => ({})),
      },
      $transaction: vi.fn(async (callback: any) => callback(transaction)),
    } as unknown as PrismaClient;

    const result = await generateControlledEditorialDraft(client, 'brief-1', { generator, critic });
    expect(result).toMatchObject({ outcome: 'READY_FOR_REVIEW', qualityScore: 100, claims: 2, inputTokens: 150, outputTokens: 70, estimatedCostMicros: 5 });
    expect(transaction.editorialDraftClaim.createMany).toHaveBeenCalledOnce();
    expect(transaction.editorialDraftClaimEvidence.createMany).toHaveBeenCalledOnce();
    expect(transaction.editorialQualityGate.upsert.mock.calls[0][0].create).toMatchObject({ automatedDecision: 'PASSED', humanReviewStatus: 'PENDING' });
    expect(transaction.editorialDraftRevision.create.mock.calls[0][0].data).toMatchObject({ version: 1, origin: 'GENERATED', status: 'GATE_PASSED' });
    expect(transaction.editorialDraft.update.mock.calls[0][0].data.currentRevisionId).toBeTruthy();
    expect(transaction.article.create).not.toHaveBeenCalled();
  });

  it('is idempotent once a draft is ready for human review', async () => {
    const generate = vi.fn();
    const review = vi.fn();
    const client = {
      editorialBrief: { findUnique: vi.fn(async () => briefSource()) },
      editorialDraft: {
        createMany: vi.fn(async () => ({ count: 0 })),
        findUnique: vi.fn(async () => ({ id: 'draft-1', briefId: 'brief-1', status: 'READY_FOR_REVIEW', claims: [{ id: 'claim-1' }, { id: 'claim-2' }], qualityGate: { qualityScore: 90, publishabilityScore: 88 }, metrics: { inputTokens: 10 } })),
      },
    } as unknown as PrismaClient;
    const result = await generateControlledEditorialDraft(client, 'brief-1', { generator: { model: 'generator-test', generate }, critic: { model: 'critic-test', review } });
    expect(result.outcome).toBe('ALREADY_READY');
    expect(generate).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
  });

  it('includes frozen brief and evidence hashes in the deterministic identity', () => {
    const config = resolveEditorialDraftConfig();
    const base = { briefId: 'brief-1', briefContentHash: 'brief-hash', evidenceHash: 'evidence-hash', generatorModel: 'g', criticModel: 'c', config };
    expect(buildEditorialDraftIdempotencyKey(base)).toBe(buildEditorialDraftIdempotencyKey({ ...base }));
    expect(buildEditorialDraftIdempotencyKey(base)).not.toBe(buildEditorialDraftIdempotencyKey({ ...base, evidenceHash: 'changed' }));
  });
});
