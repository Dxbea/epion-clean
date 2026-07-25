import { describe, expect, it, vi } from 'vitest';
import { resolveEditorialVerificationRuntimeFlags } from '../src/lib/editorial-verification/runtime-flags.js';

const prismaMock = vi.hoisted(() => ({
  discoverySource: { findMany: vi.fn() },
  ingestedDocument: { findMany: vi.fn() },
  editorialRun: { findFirst: vi.fn() },
  editorialCandidate: { findFirst: vi.fn() },
  editorialBrief: { findFirst: vi.fn() },
  editorialDraft: { findFirst: vi.fn() },
  editorialReviewAuditLog: { count: vi.fn() },
}));
vi.mock('../src/lib/db.js', () => ({ prisma: prismaMock }));

import { runEditorialAutomationTick } from '../src/workers/editorial-automation.worker.js';
import { assertEditorialAutomationOnceSafety } from '../src/scripts/editorial-automation-once.js';

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
  it('resolves configured DiscoverySource keys to durable Source ids and queues discovered ECB documents before robots are checked', async () => {
    prismaMock.discoverySource.findMany.mockResolvedValue([
      { id: 'discovery-ecb', key: 'institution-ecb-press', sourceId: 'durable-ecb', categoryId: 'economy' },
      { id: 'discovery-inserm', key: 'institution-inserm-actualites', sourceId: 'durable-inserm', categoryId: 'health' },
    ]);
    prismaMock.ingestedDocument.findMany
      .mockResolvedValueOnce([{ id: 'ecb-document', status: 'DISCOVERED', isIndexed: false, robotsAllowed: null, accessPolicy: 'FULL_FETCH', storagePolicy: 'FULL' }])
      .mockResolvedValueOnce([]);
    prismaMock.editorialRun.findFirst.mockResolvedValue(null);
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
    prismaMock.editorialRun.findFirst.mockResolvedValue(null); prismaMock.editorialCandidate.findFirst.mockResolvedValue(null); prismaMock.editorialBrief.findFirst.mockResolvedValue(null); prismaMock.editorialDraft.findFirst.mockResolvedValue(null); prismaMock.editorialReviewAuditLog.count.mockResolvedValue(0);
    const report = await runEditorialAutomationTick(flags(), queues(), new Date('2026-07-25T10:00:00.000Z'));
    expect(report.documentsBlocked).toEqual([{ documentId: 'blocked', reason: 'ROBOTS_DISALLOWED' }]);
    expect(report.blockages).toEqual(expect.arrayContaining(['MISSING_CATEGORY:institution-ecb-press', 'NO_INDEXABLE_DISCOVERED_DOCUMENTS']));
  });

  it('requires the one-shot confirmation and honours its local kill switch', () => {
    expect(() => assertEditorialAutomationOnceSafety([], flags())).toThrow('Confirmation required');
    expect(() => assertEditorialAutomationOnceSafety(['--confirm=EPION_EDITORIAL_AUTOMATION'], resolveEditorialVerificationRuntimeFlags({ EDITORIAL_AUTOMATION_ENABLED: 'true', EDITORIAL_AUTOMATION_KILL_SWITCH: 'true' }))).toThrow('kill-switched');
  });
});
