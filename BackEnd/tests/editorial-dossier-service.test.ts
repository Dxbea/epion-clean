import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { buildEditorialDossierIdempotencyKey, buildEditorialSourceDossier, resolveEditorialBriefConfig, selectEditorialCandidates } from '../src/lib/editorial-brief/dossier-service.js';
import { EDITORIAL_BRIEF_PROMPT_VERSION, EDITORIAL_DOSSIER_VERSION, type EditorialBriefGenerator } from '../src/lib/editorial-brief/types.js';

const candidate = {
  id: 'candidate-1', editorialScore: 88, riskLevel: 'MEDIUM', shadowOnly: true, status: 'SHADOW_PROPOSED',
  topic: { id: 'topic-1', label: 'Topic', runId: 'run-1', independentDomainCount: 3, documentCount: 4, representativeDocumentId: 'doc-1', latestEventAt: new Date('2026-07-18T10:00:00Z') },
};

describe('editorial source dossier service', () => {
  it('builds a stable identity from candidate, versions, model and config', () => {
    const config = resolveEditorialBriefConfig();
    const input = { candidateId: 'candidate-1', dossierVersion: EDITORIAL_DOSSIER_VERSION, promptVersion: EDITORIAL_BRIEF_PROMPT_VERSION, generatorModel: 'test-model', config };
    expect(buildEditorialDossierIdempotencyKey(input)).toBe(buildEditorialDossierIdempotencyKey({ ...input }));
    expect(buildEditorialDossierIdempotencyKey(input)).not.toBe(buildEditorialDossierIdempotencyKey({ ...input, generatorModel: 'another-model' }));
  });

  it('ranks only proposed candidates that satisfy risk-adjusted domain diversity', async () => {
    const client = {
      editorialCandidate: { findMany: vi.fn(async () => [
        { id: 'high-insufficient', editorialScore: 95, riskLevel: 'HIGH', topic: { independentDomainCount: 2 } },
        { id: 'medium-ready', editorialScore: 90, riskLevel: 'MEDIUM', topic: { independentDomainCount: 2 } },
        { id: 'high-ready', editorialScore: 85, riskLevel: 'HIGH', topic: { independentDomainCount: 3 } },
      ]) },
    } as unknown as PrismaClient;
    const selected = await selectEditorialCandidates(client, 'run-1', { maximumCandidates: 2 });
    expect(selected).toEqual([
      { candidateId: 'medium-ready', editorialScore: 90, riskLevel: 'MEDIUM', requiredDomains: 2, rank: 1 },
      { candidateId: 'high-ready', editorialScore: 85, riskLevel: 'HIGH', requiredDomains: 3, rank: 2 },
    ]);
  });

  it('selects exactly one low-score, single-domain candidate only for its controlled prod-shadow run', async () => {
    const client = {
      editorialCandidate: { findMany: vi.fn(async () => [
        { id: 'controlled-candidate', editorialScore: 25.28, riskLevel: 'MEDIUM', topic: { independentDomainCount: 1 } },
      ]) },
    } as unknown as PrismaClient;
    await expect(selectEditorialCandidates(client, 'run-1')).resolves.toEqual([]);
    await expect(selectEditorialCandidates(client, 'run-1', { prodShadowControlled: true })).resolves.toEqual([
      { candidateId: 'controlled-candidate', editorialScore: 25.28, riskLevel: 'MEDIUM', requiredDomains: 1, rank: 1 },
    ]);
    expect(vi.mocked(client.editorialCandidate.findMany).mock.calls[1][0]).toMatchObject({
      where: { shadowOnly: true, status: 'SHADOW_PROPOSED', topic: { runId: 'run-1' } }, take: 1,
    });
  });

  it('permits a one-document evidence cap only for the controlled prod-shadow path', () => {
    expect(() => resolveEditorialBriefConfig({ maximumDocuments: 1 })).toThrow('maximumDocuments');
    expect(resolveEditorialBriefConfig({ maximumDocuments: 1, prodShadowControlled: true })).toMatchObject({ maximumDocuments: 1 });
  });

  it('returns an already-completed dossier without regenerating the brief', async () => {
    const generate = vi.fn();
    const generator: EditorialBriefGenerator = { model: 'test-model', generate };
    const persisted = { id: 'dossier-1', candidateId: candidate.id, status: 'COMPLETED', selectedChunkCount: 4, selectedDomainCount: 3, evidenceHash: 'hash', evidence: [], brief: { inputTokens: 10, outputTokens: 20, estimatedCostMicros: 2 } };
    const client = {
      editorialCandidate: { findUnique: vi.fn(async () => candidate) },
      editorialSourceDossier: {
        createMany: vi.fn(async () => ({ count: 0 })),
        findUnique: vi.fn(async () => persisted),
      },
    } as unknown as PrismaClient;

    const first = await buildEditorialSourceDossier(client, candidate.id, 1, { generator });
    const second = await buildEditorialSourceDossier(client, candidate.id, 1, { generator });
    expect(first.outcome).toBe('ALREADY_COMPLETED');
    expect(second).toEqual(first);
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects suppressed candidates and validates high-risk diversity limits', async () => {
    expect(() => resolveEditorialBriefConfig({ highRiskMinimumDomains: 4, maximumDocuments: 3 })).toThrow('maximumDocuments');
    const client = { editorialCandidate: { findUnique: vi.fn(async () => ({ ...candidate, status: 'SHADOW_SUPPRESSED' })) } } as unknown as PrismaClient;
    await expect(buildEditorialSourceDossier(client, candidate.id, 1, { generator: { model: 'test', generate: vi.fn() } })).rejects.toThrow('shadow-proposed');
  });
});
