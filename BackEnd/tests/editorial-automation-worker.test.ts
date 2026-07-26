import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveEditorialVerificationRuntimeFlags } from '../src/lib/editorial-verification/runtime-flags.js';
import { DOCUMENT_EMBEDDING_MODEL } from '../src/lib/document-corpus/document-rag-service.js';
import { prepareEditorialShadowJob } from '../src/lib/editorial-shadow/editorial-queue.js';

const prismaMock = vi.hoisted(() => ({
  discoverySource: { findMany: vi.fn() },
  ingestedDocument: { findMany: vi.fn() },
  editorialRun: { findFirst: vi.fn(), findUnique: vi.fn() },
  editorialTopic: { findMany: vi.fn() },
  editorialCandidate: { findFirst: vi.fn(), findMany: vi.fn() },
  editorialBrief: { findFirst: vi.fn() },
  editorialDraft: { findFirst: vi.fn() },
  editorialReviewAuditLog: { count: vi.fn() },
}));
vi.mock('../src/lib/db.js', () => ({ prisma: prismaMock }));

import { runEditorialAutomationTick } from '../src/workers/editorial-automation.worker.js';
import {
  assertEditorialAutomationOnceSafety,
  runEditorialAutomationPasses,
} from '../src/scripts/editorial-automation-once.js';

function flags() {
  return resolveEditorialVerificationRuntimeFlags({
    EDITORIAL_AUTOMATION_ENABLED: 'true', EDITORIAL_AUTOMATION_KILL_SWITCH: 'false',
    EDITORIAL_AUTOMATION_SOURCE_KEYS: 'institution-ecb-press,institution-inserm-actualites',
  });
}

function queues() {
  return {
    discoveryQueue: { add: vi.fn() }, documentQueue: { add: vi.fn() }, editorialQueue: { add: vi.fn() },
    briefQueue: { add: vi.fn() }, draftQueue: { add: vi.fn() }, verificationQueue: { add: vi.fn() },
  };
}

describe('editorial automation indexing selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.editorialTopic.findMany.mockResolvedValue([]);
    prismaMock.editorialCandidate.findMany.mockResolvedValue([]);
  });

  it('resolves configured DiscoverySource keys to durable Source ids and queues discovered ECB documents before robots are checked', async () => {
    prismaMock.discoverySource.findMany.mockResolvedValue([
      { id: 'discovery-ecb', key: 'institution-ecb-press', sourceId: 'durable-ecb', categoryId: 'economy' },
      { id: 'discovery-inserm', key: 'institution-inserm-actualites', sourceId: 'durable-inserm', categoryId: 'health' },
    ]);
    prismaMock.ingestedDocument.findMany
      .mockResolvedValueOnce([{ id: 'ecb-document', status: 'DISCOVERED', isIndexed: false, robotsAllowed: null, accessPolicy: 'FULL_FETCH', storagePolicy: 'FULL' }])
      .mockResolvedValueOnce([]);
    prismaMock.editorialRun.findUnique.mockResolvedValue(null);
    prismaMock.editorialCandidate.findFirst.mockResolvedValue(null);
    prismaMock.editorialBrief.findFirst.mockResolvedValue(null);
    prismaMock.editorialDraft.findFirst.mockResolvedValue(null);
    prismaMock.editorialReviewAuditLog.count.mockResolvedValue(0);
    const queue = queues();
    const report = await runEditorialAutomationTick(flags(), queue, new Date('2026-07-25T10:00:00.000Z'));
    expect(prismaMock.ingestedDocument.findMany.mock.calls[0][0].where).toMatchObject({ sourceId: { in: ['durable-ecb', 'durable-inserm'] } });
    expect(prismaMock.ingestedDocument.findMany.mock.calls[0][0].where).not.toHaveProperty('discoveries');
    expect(queue.documentQueue.add).toHaveBeenCalledOnce();
    expect(report).toMatchObject({ documentsDiscovered: 1, documentsQueuedForIndexing: 1, documentsBlocked: [] });
  });

  it('reports precise blockers instead of silently returning indexing=0', async () => {
    prismaMock.discoverySource.findMany.mockResolvedValue([
      { id: 'discovery-ecb', key: 'institution-ecb-press', sourceId: 'durable-ecb', categoryId: null },
      { id: 'discovery-inserm', key: 'institution-inserm-actualites', sourceId: 'durable-inserm', categoryId: null },
    ]);
    prismaMock.ingestedDocument.findMany.mockResolvedValueOnce([{ id: 'blocked', status: 'DISCOVERED', isIndexed: false, robotsAllowed: false, accessPolicy: 'FULL_FETCH', storagePolicy: 'FULL' }]).mockResolvedValueOnce([]);
    prismaMock.editorialRun.findUnique.mockResolvedValue(null); prismaMock.editorialCandidate.findFirst.mockResolvedValue(null); prismaMock.editorialBrief.findFirst.mockResolvedValue(null); prismaMock.editorialDraft.findFirst.mockResolvedValue(null); prismaMock.editorialReviewAuditLog.count.mockResolvedValue(0);
    const report = await runEditorialAutomationTick(flags(), queues(), new Date('2026-07-25T10:00:00.000Z'));
    expect(report.documentsBlocked).toEqual([{ documentId: 'blocked', reason: 'ROBOTS_DISALLOWED' }]);
    expect(report.blockages).toEqual(expect.arrayContaining(['MISSING_CATEGORY:institution-ecb-press', 'NO_CLUSTERABLE_DOCUMENTS']));
  });

  it('continues to clustering with recently indexed documents even when no new document is queued', async () => {
    prismaMock.discoverySource.findMany.mockResolvedValue([
      { id: 'discovery-ecb', key: 'institution-ecb-press', sourceId: 'durable-ecb', categoryId: 'economy' },
      { id: 'discovery-inserm', key: 'institution-inserm-actualites', sourceId: 'durable-inserm', categoryId: 'health' },
    ]);
    prismaMock.ingestedDocument.findMany
      .mockResolvedValueOnce([
        { id: 'ecb-indexed', status: 'INDEXED', isIndexed: true, robotsAllowed: true, accessPolicy: 'FULL_FETCH', storagePolicy: 'FULL' },
        { id: 'inserm-indexed', status: 'INDEXED', isIndexed: true, robotsAllowed: true, accessPolicy: 'FULL_FETCH', storagePolicy: 'FULL' },
      ])
      .mockResolvedValueOnce([{ id: 'ecb-indexed', domain: 'ecb.europa.eu' }, { id: 'inserm-indexed', domain: 'inserm.fr' }]);
    prismaMock.editorialRun.findUnique.mockResolvedValue(null); prismaMock.editorialCandidate.findFirst.mockResolvedValue(null); prismaMock.editorialBrief.findFirst.mockResolvedValue(null); prismaMock.editorialDraft.findFirst.mockResolvedValue(null); prismaMock.editorialReviewAuditLog.count.mockResolvedValue(0);
    const queue = queues();
    const report = await runEditorialAutomationTick(flags(), queue, new Date('2026-07-25T10:00:00.000Z'), { indexedLookbackHours: 24 });
    expect(report).toMatchObject({ documentsQueuedForIndexing: 0, documentsAlreadyIndexed: 2, documentsEligibleForClustering: 2, clusters: 1 });
    expect(report.blockages).not.toContain('NO_INDEXABLE_DISCOVERED_DOCUMENTS');
    expect(queue.editorialQueue.add).toHaveBeenCalledOnce();
  });

  it('starts a source-poor initial cluster with two indexed documents from one domain', async () => {
    prismaMock.discoverySource.findMany.mockResolvedValue([
      { id: 'discovery-ecb', key: 'institution-ecb-press', sourceId: 'durable-ecb', categoryId: 'economy', connectorType: 'RSS' },
      { id: 'discovery-inserm', key: 'institution-inserm-actualites', sourceId: 'durable-inserm', categoryId: 'health', connectorType: 'RSS' },
    ]);
    prismaMock.ingestedDocument.findMany
      .mockResolvedValueOnce([
        { id: 'doc-1', status: 'INDEXED', isIndexed: true, robotsAllowed: true, accessPolicy: 'FULL_FETCH', storagePolicy: 'FULL' },
        { id: 'doc-2', status: 'INDEXED', isIndexed: true, robotsAllowed: true, accessPolicy: 'FULL_FETCH', storagePolicy: 'FULL' },
      ])
      .mockResolvedValueOnce([
        { id: 'doc-1', domain: 'same.example', sourceId: 'durable-ecb' },
        { id: 'doc-2', domain: 'same.example', sourceId: 'durable-ecb' },
      ]);
    prismaMock.editorialRun.findUnique.mockResolvedValue(null);
    prismaMock.editorialCandidate.findFirst.mockResolvedValue(null);
    prismaMock.editorialCandidate.findMany.mockResolvedValue([{
      rationale: {
        reasons: ['SOURCE_ENRICHMENT_INSUFFICIENT'],
        enrichment: {
          sourcesAccepted: 1,
          newlyIngestedDocuments: ['doc-serper'],
          persistedDocuments: 1,
          indexedDocuments: 1,
          evidenceDossierItems: 1,
          usedEvidenceItems: 1,
          degradedEvidenceReasons: [],
        },
      },
      topic: { independentDomainCount: 1, documentCount: 3 },
      sourceDossiers: [],
    }]);
    prismaMock.editorialBrief.findFirst.mockResolvedValue(null);
    prismaMock.editorialDraft.findFirst.mockResolvedValue(null);
    prismaMock.editorialReviewAuditLog.count.mockResolvedValue(0);
    const queue = queues();

    const report = await runEditorialAutomationTick(
      flags(),
      queue,
      new Date('2026-07-25T10:00:00.000Z'),
    );

    expect(queue.editorialQueue.add).toHaveBeenCalledOnce();
    expect(report).toMatchObject({
      clusters: 1,
      initialDocuments: 2,
      initialDomains: 1,
      sourcePoorInitialClusters: 1,
      enrichmentAttempted: true,
      enrichmentSources: 1,
      enrichmentPersistedDocuments: 1,
      enrichmentIndexedDocuments: 1,
      finalEligibleDomains: 1,
      finalBlockage: 'ENRICHMENT_INSUFFICIENT',
      evidenceDossierItems: 1,
      usedEvidenceItems: 1,
    });
    expect(report.clusterBlockages).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SOURCE_POOR_INITIAL_CLUSTER' }),
    ]));
    expect(report.minimumDomainsRequired).toBe(2);
  });

  it('derives a new run identity from the enriched final corpus and clears informational blockage', async () => {
    const now = new Date('2026-07-25T10:00:00.000Z');
    const windowStart = new Date('2026-07-25T00:00:00.000Z');
    const windowEnd = new Date('2026-07-26T00:00:00.000Z');
    const oldJob = prepareEditorialShadowJob({
      windowStart,
      windowEnd,
      embeddingModel: DOCUMENT_EMBEDDING_MODEL,
      documentIds: ['doc-1', 'doc-2'],
      trigger: 'SCHEDULED',
      requestedAt: now,
      config: { maxDocuments: 12, minProposalDocuments: 2, minProposalDomains: 2 },
    });
    prismaMock.discoverySource.findMany.mockResolvedValue([
      { id: 'discovery-ecb', key: 'institution-ecb-press', sourceId: 'durable-ecb', categoryId: 'economy', connectorType: 'RSS' },
      { id: 'discovery-inserm', key: 'institution-inserm-actualites', sourceId: 'durable-inserm', categoryId: 'health', connectorType: 'RSS' },
    ]);
    prismaMock.ingestedDocument.findMany
      .mockResolvedValueOnce([
        { id: 'doc-1', status: 'INDEXED', isIndexed: true, robotsAllowed: true, accessPolicy: 'FULL_FETCH', storagePolicy: 'FULL' },
        { id: 'doc-2', status: 'INDEXED', isIndexed: true, robotsAllowed: true, accessPolicy: 'FULL_FETCH', storagePolicy: 'FULL' },
      ])
      .mockResolvedValueOnce([
        { id: 'doc-1', domain: 'same.example', sourceId: 'durable-ecb' },
        { id: 'doc-2', domain: 'same.example', sourceId: 'durable-ecb' },
      ]);
    prismaMock.editorialCandidate.findMany.mockResolvedValue([{
      rationale: {
        enrichment: {
          sourcesAccepted: 1,
          newlyIngestedDocuments: ['doc-3'],
          persistedDocuments: 1,
          indexedDocuments: 1,
        },
      },
      topic: {
        independentDomainCount: 2,
        documentCount: 3,
        run: { idempotencyKey: oldJob.idempotencyKey },
        documents: [
          { documentId: 'doc-1', role: 'REPRESENTATIVE', document: { domain: 'same.example', status: 'INDEXED', isIndexed: true } },
          { documentId: 'doc-2', role: 'EVIDENCE', document: { domain: 'same.example', status: 'INDEXED', isIndexed: true } },
          { documentId: 'doc-3', role: 'EVIDENCE', document: { domain: 'other.example', status: 'INDEXED', isIndexed: true } },
        ],
      },
      sourceDossiers: [],
    }]);
    prismaMock.editorialRun.findUnique.mockImplementation(async ({ where }) =>
      where.idempotencyKey === oldJob.idempotencyKey
        ? { id: 'old-run', status: 'COMPLETED', completedAt: now, updatedAt: now }
        : null);
    prismaMock.editorialCandidate.findFirst.mockResolvedValue(null);
    prismaMock.editorialBrief.findFirst.mockResolvedValue(null);
    prismaMock.editorialDraft.findFirst.mockResolvedValue(null);
    prismaMock.editorialReviewAuditLog.count.mockResolvedValue(0);
    const queue = queues();

    const report = await runEditorialAutomationTick(flags(), queue, now);

    expect(queue.editorialQueue.add).toHaveBeenCalledOnce();
    expect(queue.editorialQueue.add.mock.calls[0][1]).toMatchObject({
      documentIds: ['doc-1', 'doc-2', 'doc-3'],
    });
    expect(queue.editorialQueue.add.mock.calls[0][1].idempotencyKey)
      .not.toBe(oldJob.idempotencyKey);
    expect(report).toMatchObject({
      clusters: 1,
      initialDomains: 1,
      finalEligibleDomains: 2,
      finalEligibleDocuments: 3,
      finalBlockage: null,
      publicationBlockedReason: 'AUTOPUBLISH_DISABLED_OR_NOT_REACHED',
    });
    expect(report.clusterBlockages).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SOURCE_POOR_INITIAL_CLUSTER' }),
    ]));
    expect(report.blockages).not.toContain('SOURCE_POOR_INITIAL_CLUSTER');
    expect(report.blockages).not.toContain('RUN_SKIPPED_ALREADY_COMPLETED');
  });

  it('explains why completed cluster topics do not produce a brief', async () => {
    const now = new Date('2026-07-25T10:00:00.000Z');
    prismaMock.discoverySource.findMany.mockResolvedValue([
      { id: 'discovery-ecb', key: 'institution-ecb-press', sourceId: 'durable-ecb', categoryId: 'economy', connectorType: 'RSS' },
      { id: 'discovery-inserm', key: 'institution-inserm-actualites', sourceId: 'durable-inserm', categoryId: 'health', connectorType: 'RSS' },
    ]);
    prismaMock.ingestedDocument.findMany
      .mockResolvedValueOnce([
        { id: 'doc-1', status: 'INDEXED', isIndexed: true, robotsAllowed: true, accessPolicy: 'FULL_FETCH', storagePolicy: 'FULL' },
        { id: 'doc-2', status: 'INDEXED', isIndexed: true, robotsAllowed: true, accessPolicy: 'FULL_FETCH', storagePolicy: 'FULL' },
      ])
      .mockResolvedValueOnce([
        { id: 'doc-1', domain: 'ecb.europa.eu', sourceId: 'durable-ecb' },
        { id: 'doc-2', domain: 'inserm.fr', sourceId: 'durable-inserm' },
      ]);
    prismaMock.editorialRun.findUnique.mockResolvedValue({
      id: 'run-1',
      status: 'COMPLETED',
      completedAt: now,
      updatedAt: now,
    });
    prismaMock.editorialCandidate.findFirst.mockResolvedValue(null);
    prismaMock.editorialBrief.findFirst.mockResolvedValue(null);
    prismaMock.editorialDraft.findFirst.mockResolvedValue(null);
    prismaMock.editorialReviewAuditLog.count.mockResolvedValue(0);
    prismaMock.editorialTopic.findMany.mockResolvedValue([
      {
        id: 'topic-suppressed',
        runId: 'run-1',
        clusterKey: 'cluster-1',
        label: 'Suppressed topic',
        documentCount: 2,
        independentDomainCount: 2,
        run: { status: 'COMPLETED' },
        documents: [
          { documentId: 'doc-1', role: 'REPRESENTATIVE', document: { domain: 'ecb.europa.eu', sourceId: 'durable-ecb' } },
          { documentId: 'doc-2', role: 'EVIDENCE', document: { domain: 'inserm.fr', sourceId: 'durable-inserm' } },
        ],
        candidate: {
          id: 'candidate-suppressed',
          status: 'SHADOW_SUPPRESSED',
          editorialScore: 49.2,
          riskLevel: 'MEDIUM',
          rationale: { reasons: ['editorial_score_below_threshold'] },
          sourceDossiers: [],
        },
      },
      {
        id: 'topic-skipped',
        runId: 'run-1',
        clusterKey: 'cluster-2',
        label: 'Skipped topic',
        documentCount: 1,
        independentDomainCount: 1,
        run: { status: 'COMPLETED' },
        documents: [
          { documentId: 'doc-3', role: 'REPRESENTATIVE', document: { domain: 'example.org', sourceId: null } },
        ],
        candidate: null,
      },
    ]);

    const report = await runEditorialAutomationTick(flags(), queues(), now);

    expect(report.briefs).toBe(0);
    expect(report.clusterOutcomes).toEqual([
      expect.objectContaining({
        topicId: 'topic-suppressed',
        status: 'suppressed',
        editorialScore: 49.2,
        proposalMinimumEditorialScore: 55,
        domains: ['ecb.europa.eu', 'inserm.fr'],
        documentCount: 2,
        sourceCount: 2,
        suppressionReasons: ['editorial_score_below_threshold'],
        briefMinimumEditorialScore: 60,
        briefRequiredDomains: 2,
        briefDisposition: 'suppressed',
      }),
      expect.objectContaining({
        topicId: 'topic-skipped',
        status: 'skipped',
        candidateId: null,
        briefReasons: ['candidate_not_created'],
      }),
    ]);
    expect(report.briefBlockages).toEqual([
      expect.objectContaining({
        code: 'CANDIDATE_SUPPRESSED',
        detail: expect.objectContaining({
          candidateId: 'candidate-suppressed',
          reasons: ['editorial_score_below_threshold'],
        }),
      }),
      expect.objectContaining({
        code: 'CANDIDATE_SKIPPED',
        detail: expect.objectContaining({
          topicId: 'topic-skipped',
          reasons: ['candidate_not_created'],
        }),
      }),
    ]);
  });

  it('polls productive one-shot passes and preserves dispatched stage reporting', async () => {
    const stages = [
      { clusters: 1 },
      { briefs: 1 },
      { drafts: 1 },
      { verifications: 1 },
      {},
    ];
    const runTick = vi.fn(async () => ({
      documentsQueuedForIndexing: 0,
      documentsAlreadyIndexed: 2,
      documentsIndexedThisRun: 0,
      clusters: 0,
      briefs: 0,
      drafts: 0,
      verifications: 0,
      existingRun: null,
      ...stages.shift(),
    } as any));
    let clock = 0;

    const report = await runEditorialAutomationPasses(runTick, {
      waitMs: 10_000,
      pollMs: 1_000,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
    });

    expect(runTick).toHaveBeenCalledTimes(5);
    expect(report).toMatchObject({
      automationPasses: 5,
      clusters: 1,
      briefs: 1,
      drafts: 1,
      verifications: 1,
    });
  });

  it('keeps a controlled publication pass alive until a publication audit is visible', async () => {
    const reports = [
      { clusters: 1, publications: 0 },
      { clusters: 0, publications: 0 },
      { clusters: 0, publications: 1 },
    ];
    const runTick = vi.fn(async () => ({
      documentsQueuedForIndexing: 0,
      documentsAlreadyIndexed: 2,
      documentsIndexedThisRun: 0,
      clusters: 0,
      briefs: 0,
      drafts: 0,
      verifications: 0,
      publications: 0,
      existingRun: { status: 'COMPLETED' },
      ...reports.shift(),
    } as any));
    let clock = 0;

    const report = await runEditorialAutomationPasses(runTick, {
      waitMs: 10_000,
      pollMs: 1_000,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
      until: (current) => current.publications > 0,
    });

    expect(runTick).toHaveBeenCalledTimes(3);
    expect(report.publications).toBe(1);
  });

  it('requires the one-shot confirmation and honours its local kill switch', () => {
    expect(() => assertEditorialAutomationOnceSafety([], flags())).toThrow('Confirmation required');
    expect(() => assertEditorialAutomationOnceSafety(['--confirm=EPION_EDITORIAL_AUTOMATION'], resolveEditorialVerificationRuntimeFlags({ EDITORIAL_AUTOMATION_ENABLED: 'true', EDITORIAL_AUTOMATION_KILL_SWITCH: 'true' }))).toThrow('kill-switched');
  });
});
