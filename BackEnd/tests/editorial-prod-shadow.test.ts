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
  parseProdShadowE2EOptions,
  PROD_SHADOW_FORBIDDEN_ACTIONS,
  type ProdShadowE2EState,
} from '../src/scripts/prod-shadow-editorial-e2e.js';
import { parseProdShadowSeedOptions, seedProdShadowEditorial } from '../src/scripts/seed-prod-shadow-editorial.js';

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
  unindexedDocumentIds: [],
  run: { id: 'run-1', status: 'COMPLETED', topicCount: 1 },
  brief: { id: 'brief-1' },
  draft: {
    id: 'draft-1', status: 'ARTICLE_DRAFT_CREATED', contentHash: 'hash-1',
    articleStatus: 'DRAFT', publishedAt: null, humanReviewStatus: 'APPROVED', publicationAuditCount: 0,
  },
  verification: { id: 'verification-1', status: 'PASSED', shadowDecision: 'WOULD_AUTO_PUBLISH' },
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
    expect(() => determineProdShadowE2ENextStage({ ...complete, discoveredDocuments: 2 })).toThrow('at most one controlled document');
    expect(() => determineProdShadowE2ENextStage({ ...complete, run: { ...complete.run!, topicCount: 2 } })).toThrow('at most one topic');
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
