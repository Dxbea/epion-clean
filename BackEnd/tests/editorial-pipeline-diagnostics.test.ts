import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { collectEditorialPipelineDiagnostics } from '../src/lib/editorial-automation/pipeline-diagnostics.js';

describe('editorial production pipeline diagnostics', () => {
  it('does not validate a clustered run when no proposed candidate reaches a brief', async () => {
    const client = {
      editorialTopic: {
        findMany: vi.fn(async () => [
          { candidate: { status: 'SHADOW_SUPPRESSED' } },
        ]),
      },
      editorialSourceDossier: { findMany: vi.fn(async () => []) },
      editorialDraft: { findMany: vi.fn(async () => []) },
    } as unknown as PrismaClient;

    const report = await collectEditorialPipelineDiagnostics(client, {
      windowStart: new Date('2026-07-26T00:00:00.000Z'),
      windowEnd: new Date('2026-07-27T00:00:00.000Z'),
    });

    expect(report.validated).toBe(false);
    expect(report.stages).toMatchObject({
      topics: 1,
      candidatesProposed: 0,
      candidatesSuppressed: 1,
      briefs: 0,
      drafts: 0,
      verifications: 0,
      publishedArticles: 0,
    });
    expect(report.blockingReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'NO_PROPOSED_CANDIDATES' }),
      expect.objectContaining({ code: 'NO_SOURCE_DOSSIER' }),
    ]));
  });
});
