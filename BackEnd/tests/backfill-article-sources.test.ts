import { describe, expect, it, vi } from 'vitest';
import {
  parseBackfillDryRunOptions,
  runArticleSourceBackfillDryRun,
  type BackfillReadClient,
} from '../src/scripts/backfill-article-sources.js';

function clientFor(input: {
  articles: Array<{ id: string; factCheckData: unknown }>;
  sources?: Array<{ id: string; domain: string }>;
  existing?: Array<{ articleId: string; sourceUrlHash: string }>;
}) {
  const articleFindMany = vi.fn()
    .mockResolvedValueOnce(input.articles)
    .mockResolvedValueOnce([]);
  const sourceFindMany = vi.fn().mockResolvedValue(input.sources ?? []);
  const articleSourceFindMany = vi.fn().mockResolvedValue(input.existing ?? []);
  const write = vi.fn();

  return {
    client: {
      article: { findMany: articleFindMany },
      source: { findMany: sourceFindMany },
      articleSource: { findMany: articleSourceFindMany },
    } satisfies BackfillReadClient,
    reads: { articleFindMany, sourceFindMany, articleSourceFindMany },
    write,
  };
}

describe('ArticleSource backfill dry-run', () => {
  it('requires the explicit dry-run flag', () => {
    expect(() => parseBackfillDryRunOptions([])).toThrow(/requires --dry-run/);
    expect(parseBackfillDryRunOptions(['--dry-run', '--limit', '20', '--batch-size', '5']))
      .toEqual({ dryRun: true, limit: 20, batchSize: 5, cursor: undefined });
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
    });

    const report = await runArticleSourceBackfillDryRun(
      fixture.client,
      { dryRun: true, batchSize: 100 },
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
    expect(fixture.write).not.toHaveBeenCalled();
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

    const report = await runArticleSourceBackfillDryRun(
      fixture.client,
      { dryRun: true, batchSize: 100 },
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

    const report = await runArticleSourceBackfillDryRun(
      fixture.client,
      { dryRun: true, batchSize: 100 },
      vi.fn(),
    );

    expect(report.sourcesRead).toBe(2);
    expect(report.relationsWouldCreate).toBe(1);
    expect(report.duplicatesDetected).toBe(1);
    expect(report.samples[0]).toMatchObject({ role: 'UNKNOWN', provenance: 'IMPORTED_LEGACY' });
  });
});
