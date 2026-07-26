import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  assertProdShadowSafety,
  PROD_SHADOW_CONFIRMATION,
  PROD_SHADOW_DISCOVERY_SOURCE_KEY,
} from '../src/lib/editorial-prod-shadow/safety.js';
import {
  determineProdShadowE2ENextStage,
  classifyProdShadowDocuments,
  enqueueProdShadowDocumentIndexing,
  prepareProdShadowClusteringRetry,
  prepareProdShadowDraftRetry,
  parseProdShadowE2EOptions,
  PROD_SHADOW_FORBIDDEN_ACTIONS,
  type ProdShadowE2EState,
} from '../src/scripts/prod-shadow-editorial-e2e.js';
import { parseProdShadowSeedOptions, seedProdShadowEditorial } from '../src/scripts/seed-prod-shadow-editorial.js';
import { buildEditorialDraftJobId } from '../src/lib/editorial-draft/draft-queue.js';

const safeProductionEnv = {
  NODE_ENV: 'production',
  EPION_PROD_SHADOW_ENABLED: 'true',
  EDITORIAL_AUTOPUBLISH_ENABLED: 'false',
  EDITORIAL_AUTO_PUBLISH_ENABLED: 'false',
  AUTO_PUBLISH_ENABLED: 'false',
  DISCOVERY_SCHEDULER_ENABLED: 'false',
  EDITORIAL_SHADOW_OPS_MUTATIONS_ENABLED: 'false',
  EDITORIAL_SHADOW_OPS_KILL_SWITCH: 'true',
  PROD_SHADOW_MAX_DOCUMENTS: '1',
  PROD_SHADOW_MAX_TOPICS: '1',
  PROD_SHADOW_EDITORIAL_FEED_URL: 'https://controlled.example.test/feed.xml',
};

const complete: ProdShadowE2EState = {
  sourceExists: true,
  sourceEnabled: true,
  discoveredDocuments: 1,
  indexedDocuments: ['doc-1'],
  actionableUnindexedDocuments: [],
  terminalBlockedDocuments: [],
  recentEmptyRuns: [],
  unindexedDocumentIds: [],
  run: { id: 'run-1', status: 'COMPLETED', topicCount: 1, documentsConsidered: 1 },
  brief: { id: 'brief-1' },
  draft: {
    id: 'draft-1', briefId: 'brief-1', status: 'ARTICLE_DRAFT_CREATED', currentRevisionStatus: 'APPROVED', contentHash: 'hash-1',
    articleStatus: 'DRAFT', publishedAt: null, humanReviewStatus: 'APPROVED', qualityGateDecision: 'PASSED', qualityGateReasons: [], publicationAuditCount: 0, articleSourcesComplete: true,
  },
  verification: { id: 'verification-1', status: 'PASSED', shadowDecision: 'WOULD_AUTO_PUBLISH', mistralPromptVersion: 'editorial-mistral-audit-v3' },
};

describe('production-shadow editorial safety', () => {
  it('requires production plus every explicit shadow safety flag', () => {
    expect(assertProdShadowSafety(safeProductionEnv)).toMatchObject({ environment: 'production', shadowOnly: true, maxDocuments: 1, maxTopics: 1 });
    expect(() => assertProdShadowSafety({ ...safeProductionEnv, NODE_ENV: 'staging' })).toThrow('NODE_ENV=production');
    expect(() => assertProdShadowSafety({ ...safeProductionEnv, EDITORIAL_AUTOPUBLISH_ENABLED: 'true' })).toThrow('EDITORIAL_AUTOPUBLISH_ENABLED must be false');
    expect(() => assertProdShadowSafety({ ...safeProductionEnv, EDITORIAL_SHADOW_OPS_MUTATIONS_ENABLED: 'true' })).toThrow('EDITORIAL_SHADOW_OPS_MUTATIONS_ENABLED must be false');
  });

  it('is dry-run by default and rejects writes without the exact confirmation', () => {
    expect(parseProdShadowE2EOptions([]).advance).toBe(false);
    expect(() => parseProdShadowE2EOptions(['--advance'])).toThrow(`--confirm=${PROD_SHADOW_CONFIRMATION}`);
    expect(parseProdShadowE2EOptions(['--advance', `--confirm=${PROD_SHADOW_CONFIRMATION}`])).toMatchObject({ advance: true, sourceKey: PROD_SHADOW_DISCOVERY_SOURCE_KEY });
  });

  it('has no publication action and completes only with an unpublished DRAFT', () => {
    expect(PROD_SHADOW_FORBIDDEN_ACTIONS).toEqual(['authorize-publication', 'publish']);
    expect(determineProdShadowE2ENextStage(complete)).toBe('COMPLETE');
    expect(() => determineProdShadowE2ENextStage({ ...complete, draft: { ...complete.draft!, articleStatus: 'PUBLISHED' } })).toThrow('was published');
    expect(() => determineProdShadowE2ENextStage({ ...complete, draft: { ...complete.draft!, publishedAt: new Date() } })).toThrow('was published');
    expect(() => determineProdShadowE2ENextStage({ ...complete, discoveredDocuments: 2, actionableUnindexedDocuments: ['doc-2'] })).toThrow('at most one actionable controlled document');
    expect(() => determineProdShadowE2ENextStage({ ...complete, run: { ...complete.run!, topicCount: 2 } })).toThrow('at most one topic');
  });

  it('allows only an explicit controlled retry for a failed draft and changes its BullMQ identity', () => {
    const failed = { ...complete, draft: { ...complete.draft!, id: 'failed-draft-1', status: 'FAILED', articleStatus: null, humanReviewStatus: null, contentHash: null } };
    expect(determineProdShadowE2ENextStage(failed)).toBe('WAITING_HUMAN_APPROVAL');
    expect(determineProdShadowE2ENextStage(failed, { retryDraft: true })).toBe('DRAFT');
    const retry = prepareProdShadowDraftRetry('brief-1', new Date('2026-07-22T12:00:00.000Z'));
    expect(retry).toMatchObject({ briefId: 'brief-1', trigger: 'PROD_SHADOW_RETRY' });
    expect(retry.retryKey).toMatch(/^prod-shadow-retry-/);
    expect(buildEditorialDraftJobId(retry)).not.toBe(buildEditorialDraftJobId({ ...retry, retryKey: null, trigger: 'MANUAL' }));
  });

  it('uses only the quality gate in opt-in mode and exposes a blocked failure', () => {
    const passedWithoutHumanApproval = {
      ...complete,
      draft: { ...complete.draft!, status: 'READY_FOR_REVIEW', currentRevisionStatus: 'GATE_PASSED', articleStatus: null, humanReviewStatus: 'PENDING', qualityGateDecision: 'PASSED', qualityGateReasons: [] },
      verification: null,
    };
    expect(determineProdShadowE2ENextStage(passedWithoutHumanApproval, { validationMode: 'quality_gate' })).toBe('VERIFICATION');
    expect(determineProdShadowE2ENextStage({
      ...passedWithoutHumanApproval,
      draft: { ...passedWithoutHumanApproval.draft!, status: 'QUALITY_FAILED', qualityGateDecision: 'FAILED', qualityGateReasons: ['INSUFFICIENT_INDEPENDENT_DOMAINS'] },
    }, { validationMode: 'quality_gate' })).toBe('QUALITY_GATE_BLOCKED');
    expect(determineProdShadowE2ENextStage({
      ...complete,
      draft: { ...complete.draft!, status: 'ARTICLE_DRAFT_CREATED', articleStatus: 'DRAFT', humanReviewStatus: 'PENDING', qualityGateDecision: 'PASSED', qualityGateReasons: [] },
      verification: { id: 'verification-1', status: 'PASSED', shadowDecision: 'WOULD_REQUIRE_HUMAN' },
    }, { validationMode: 'quality_gate' })).toBe('COMPLETE');
    expect(determineProdShadowE2ENextStage({
      ...complete,
      draft: { ...complete.draft!, status: 'ARTICLE_DRAFT_CREATED', articleStatus: 'DRAFT', humanReviewStatus: 'PENDING', qualityGateDecision: 'PASSED', qualityGateReasons: [], articleSourcesComplete: false },
      verification: { id: 'verification-1', status: 'HUMAN_REVIEW_REQUIRED', shadowDecision: null, mistralPromptVersion: 'editorial-mistral-audit-v1' },
    }, { validationMode: 'quality_gate' })).toBe('VERIFICATION');
    expect(determineProdShadowE2ENextStage({
      ...complete,
      draft: { ...complete.draft!, status: 'ARTICLE_DRAFT_CREATED', articleStatus: 'DRAFT', humanReviewStatus: 'PENDING', qualityGateDecision: 'PASSED', qualityGateReasons: [], articleSourcesComplete: true },
      verification: { id: 'verification-1', status: 'HUMAN_REVIEW_REQUIRED', shadowDecision: null, mistralPromptVersion: 'editorial-mistral-audit-v1' },
    }, { validationMode: 'quality_gate' })).toBe('VERIFICATION_RETRY_REQUIRED');
  });

  it('reports a robots-blocked document without re-queueing it for indexing', () => {
    const documentState = classifyProdShadowDocuments([{
      id: 'blocked-document', isIndexed: false, status: 'BLOCKED', fetchError: 'robots_disallowed', robotsAllowed: false,
    }]);
    expect(documentState.indexedDocuments).toEqual([]);
    expect(documentState.actionableUnindexedDocuments).toEqual([]);
    expect(documentState.terminalBlockedDocuments).toEqual([{
      id: 'blocked-document', status: 'BLOCKED', fetchError: 'robots_disallowed', robotsAllowed: false,
    }]);
    const blockedState: ProdShadowE2EState = {
      ...complete, discoveredDocuments: 1, indexedDocuments: [], terminalBlockedDocuments: documentState.terminalBlockedDocuments,
      actionableUnindexedDocuments: [], unindexedDocumentIds: [], run: null, brief: null, draft: null, verification: null,
    };
    expect(blockedState.unindexedDocumentIds).not.toContain('blocked-document');
    expect(determineProdShadowE2ENextStage(blockedState)).toBe('DISCOVERY');
  });

  it('excludes terminal blocked documents from the one-document actionable limit', () => {
    const documents = classifyProdShadowDocuments([
      { id: 'service-public-blocked', isIndexed: false, status: 'BLOCKED', fetchError: 'robots_disallowed', robotsAllowed: false },
      { id: 'inserm-actionable', isIndexed: false, status: 'DISCOVERED', fetchError: null, robotsAllowed: true },
    ]);
    expect(documents.terminalBlockedDocuments.map((document) => document.id)).toEqual(['service-public-blocked']);
    expect(documents.actionableUnindexedDocuments).toEqual(['inserm-actionable']);
    expect(determineProdShadowE2ENextStage({
      ...complete, discoveredDocuments: 2, indexedDocuments: documents.indexedDocuments,
      actionableUnindexedDocuments: documents.actionableUnindexedDocuments,
      terminalBlockedDocuments: documents.terminalBlockedDocuments,
      unindexedDocumentIds: documents.actionableUnindexedDocuments, run: null, brief: null, draft: null, verification: null,
    })).toBe('DOCUMENT_INDEXING');
  });

  it('rejects two actionable documents even when the configured limit is one', () => {
    const documents = classifyProdShadowDocuments([
      { id: 'document-one', isIndexed: false, status: 'DISCOVERED', fetchError: null, robotsAllowed: true },
      { id: 'document-two', isIndexed: false, status: 'DISCOVERED', fetchError: null, robotsAllowed: true },
    ]);
    expect(() => determineProdShadowE2ENextStage({
      ...complete, discoveredDocuments: 2, indexedDocuments: documents.indexedDocuments,
      actionableUnindexedDocuments: documents.actionableUnindexedDocuments,
      terminalBlockedDocuments: documents.terminalBlockedDocuments,
      unindexedDocumentIds: documents.actionableUnindexedDocuments, run: null, brief: null, draft: null, verification: null,
    })).toThrow('at most one actionable controlled document');
  });

  it('enqueues a unique retry for the controlled document when its original job is failed', async () => {
    const oldJobId = 'document-old-failed-job';
    const queue = {
      getJob: vi.fn(async () => ({ id: oldJobId, getState: vi.fn(async () => 'failed') })),
      add: vi.fn(async () => ({})),
    } as any;
    const retry = await enqueueProdShadowDocumentIndexing(queue, 'inserm-document', new Date('2026-07-21T12:00:00.000Z'));
    expect(retry).toMatchObject({
      documentId: 'inserm-document', oldJobState: 'failed', action: 'enqueued-new-retry-job',
    });
    expect(retry.jobId).not.toBe(retry.oldJobId);
    expect(queue.add).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      documentId: 'inserm-document', revision: 'prod-shadow-retry-1784635200000', trigger: 'RETRY',
    }), expect.objectContaining({ jobId: retry.jobId }));
  });

  it('retries a completed empty shadow run with a controlled indexed document', () => {
    const emptyRunState: ProdShadowE2EState = {
      ...complete,
      run: { id: 'empty-run', status: 'COMPLETED', topicCount: 0, documentsConsidered: 0 },
      recentEmptyRuns: [{ id: 'empty-run', status: 'COMPLETED', windowStart: new Date('2026-07-20T21:15:27Z'), windowEnd: new Date('2026-07-21T21:15:27Z'), documentsConsidered: 0, reason: 'window_miss' }],
    };
    expect(determineProdShadowE2ENextStage(emptyRunState)).toBe('CLUSTERING');
    const retry = prepareProdShadowClusteringRetry('inserm-document', new Date('2026-07-21T21:20:00Z'));
    expect(retry).toMatchObject({ trigger: 'PROD_SHADOW', documentIds: ['inserm-document'], config: expect.objectContaining({ maxDocuments: 1 }) });
  });

  it('does not write during seed dry-run and limits its source to the dedicated key', async () => {
    const sourceUpsert = vi.fn();
    const discoveryUpsert = vi.fn();
    const client = { source: { upsert: sourceUpsert }, discoverySource: { upsert: discoveryUpsert } } as unknown as PrismaClient;
    const options = parseProdShadowSeedOptions([], safeProductionEnv);
    await expect(seedProdShadowEditorial(client, options, safeProductionEnv)).resolves.toMatchObject({ mode: 'DRY_RUN', maxSources: 1, discoverySource: { key: PROD_SHADOW_DISCOVERY_SOURCE_KEY } });
    expect(sourceUpsert).not.toHaveBeenCalled();
    expect(discoveryUpsert).not.toHaveBeenCalled();
  });
});
