import { describe, expect, it, vi } from 'vitest';
import {
  parseBackfillOptions,
  runArticleSourceBackfill,
  type BackfillReadClient,
  type BackfillWriteClient,
} from '../src/scripts/backfill-article-sources.js';

function clientFor(input: {
  articles: Array<{ id: string; factCheckData: unknown }>;
  sources?: Array<{ id: string; domain: string }>;
  existing?: Array<{ articleId: string; sourceUrlHash: string }>;
  write?: boolean;
}) {
  const articleFindMany = vi.fn()
    .mockResolvedValueOnce(input.articles)
    .mockResolvedValueOnce([]);
  const sourceFindMany = vi.fn().mockResolvedValue(input.sources ?? []);
  const articleSourceFindMany = vi.fn().mockResolvedValue(input.existing ?? []);
  const articleSourceUpsert = vi.fn().mockResolvedValue({ id: 'article-source-1' });
  const transaction = vi.fn(async (callback: any) => callback({
    articleSource: { upsert: articleSourceUpsert },
  }));

  const client: BackfillReadClient | BackfillWriteClient = {
    article: { findMany: articleFindMany },
    source: { findMany: sourceFindMany },
    articleSource: { findMany: articleSourceFindMany },
    ...(input.write ? { $transaction: transaction } : {}),
  };

  return {
    client,
    reads: { articleFindMany, sourceFindMany, articleSourceFindMany },
    writes: { transaction, articleSourceUpsert },
  };
}

describe('ArticleSource backfill dry-run', () => {
  it('requires the explicit dry-run flag', () => {
    expect(() => parseBackfillOptions([])).toThrow(/exactly one/);
    expect(() => parseBackfillOptions(['--dry-run', '--write'])).toThrow(/exactly one/);
    expect(parseBackfillOptions(['--dry-run', '--limit', '20', '--batch-size', '5']))
      .toEqual({ mode: 'dry-run', limit: 20, batchSize: 5, cursor: undefined });
    expect(parseBackfillOptions(['--write', '--limit', '2']))
      .toEqual({ mode: 'write', limit: 2, batchSize: 100, cursor: undefined });
  });

  it('simulates IMPORTED_LEGACY relations without exposing any write operation', async () => {
    const fixture = clientFor({
      articles: [{
        id: 'article-1',
        factCheckData: {
          sources: [{
            url: 'https://example.com/report',
            profileData: { description: 'Historical profile', trustScore: 99 },
            profileVersion: 1,
            profileConfidence: 'MEDIUM',
          }],
        },
      }],
      sources: [{ id: 'durable-source-1', domain: 'example.com' }],
      write: true,
    });

    const report = await runArticleSourceBackfill(
      fixture.client,
      { mode: 'dry-run', batchSize: 100 },
      vi.fn(),
    );

    expect(report.relationsWouldCreate).toBe(1);
    expect(report.samples[0]).toMatchObject({
      articleId: 'article-1',
      sourceId: 'durable-source-1',
      role: 'UNKNOWN',
      supportStrength: 'UNKNOWN',
      provenance: 'IMPORTED_LEGACY',
      position: 0,
      profileVersion: 1,
      profileSnapshot: {
        profileData: { description: 'Historical profile' },
        profileConfidence: 'MEDIUM',
      },
    });
    expect(fixture.writes.transaction).not.toHaveBeenCalled();
    expect(Object.keys(fixture.client.article)).toEqual(['findMany']);
    expect(Object.keys(fixture.client.articleSource)).toEqual(['findMany']);
  });

  it('ignores invalid URLs and reports domains without durable Sources', async () => {
    const fixture = clientFor({
      articles: [{
        id: 'article-1',
        factCheckData: { sources: [{ url: 'not-a-url' }, { url: 'https://missing.example/report' }] },
      }],
    });

    const report = await runArticleSourceBackfill(
      fixture.client,
      { mode: 'dry-run', batchSize: 100 },
      vi.fn(),
    );

    expect(report.invalidUrls).toBe(1);
    expect(report.domainsWithoutSource).toBe(1);
    expect(report.relationsWouldCreate).toBe(0);
  });

  it('deduplicates the same normalized URL inside one article', async () => {
    const fixture = clientFor({
      articles: [{
        id: 'article-1',
        factCheckData: {
          sources: [
            { url: 'https://EXAMPLE.com/report?b=2&a=1#fragment' },
            { url: 'https://example.com/report?a=1&b=2' },
          ],
        },
      }],
      sources: [{ id: 'durable-source-1', domain: 'example.com' }],
    });

    const report = await runArticleSourceBackfill(
      fixture.client,
      { mode: 'dry-run', batchSize: 100 },
      vi.fn(),
    );

    expect(report.sourcesRead).toBe(2);
    expect(report.relationsWouldCreate).toBe(1);
    expect(report.duplicatesDetected).toBe(1);
    expect(report.samples[0]).toMatchObject({ role: 'UNKNOWN', provenance: 'IMPORTED_LEGACY' });
  });

  it('writes only ArticleSource upserts with fixed legacy classifications', async () => {
    const factCheckData = { sources: [{ url: 'https://example.com/report' }] };
    const fixture = clientFor({
      articles: [{ id: 'article-1', factCheckData }],
      sources: [{ id: 'durable-source-1', domain: 'example.com' }],
      write: true,
    });

    const report = await runArticleSourceBackfill(
      fixture.client,
      { mode: 'write', batchSize: 10 },
      vi.fn(),
    );

    expect(report.relationsCreated).toBe(1);
    expect(fixture.writes.transaction).toHaveBeenCalledOnce();
    expect(fixture.writes.articleSourceUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        articleId: 'article-1',
        sourceId: 'durable-source-1',
        role: 'UNKNOWN',
        supportStrength: 'UNKNOWN',
        provenance: 'IMPORTED_LEGACY',
      }),
    }));
    expect(factCheckData).toEqual({ sources: [{ url: 'https://example.com/report' }] });
    expect(Object.keys((fixture.client as BackfillWriteClient).article)).toEqual(['findMany']);
  });

  it('skips the existing idempotency key on a second write run', async () => {
    const articles = [{ id: 'article-1', factCheckData: { sources: [{ url: 'https://example.com/report' }] } }];
    const first = clientFor({
      articles,
      sources: [{ id: 'durable-source-1', domain: 'example.com' }],
      write: true,
    });
    await runArticleSourceBackfill(first.client, { mode: 'write', batchSize: 10 }, vi.fn());
    const firstInput = first.writes.articleSourceUpsert.mock.calls[0][0];

    const second = clientFor({
      articles,
      sources: [{ id: 'durable-source-1', domain: 'example.com' }],
      existing: [{
        articleId: 'article-1',
        sourceUrlHash: firstInput.where.articleId_sourceUrlHash.sourceUrlHash,
      }],
      write: true,
    });
    const secondReport = await runArticleSourceBackfill(
      second.client,
      { mode: 'write', batchSize: 10 },
      vi.fn(),
    );

    expect(second.writes.articleSourceUpsert).not.toHaveBeenCalled();
    expect(secondReport.relationsCreated).toBe(0);
    expect(secondReport.relationsUpdatedOrSkipped).toBe(1);
    expect(secondReport.duplicatesDetected).toBe(1);
  });

  it('resumes article pagination after the provided cursor', async () => {
    const fixture = clientFor({ articles: [] });

    await runArticleSourceBackfill(
      fixture.client,
      { mode: 'dry-run', batchSize: 5, cursor: 'article-before' },
      vi.fn(),
    );

    expect(fixture.reads.articleFindMany).toHaveBeenCalledWith(expect.objectContaining({
      cursor: { id: 'article-before' },
      skip: 1,
      take: 5,
    }));
  });
});
