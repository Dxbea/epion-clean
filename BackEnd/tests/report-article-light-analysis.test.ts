import { describe, expect, it, vi } from 'vitest';
import {
  formatArticleLightAnalysisReport,
  parseArticleLightReportOptions,
  runArticleLightAnalysisReport,
  type ArticleLightReportClient,
} from '../src/scripts/report-article-light-analysis.js';

function relation(domain: string, role = 'CONTEXT') {
  return {
    sourceId: `source-${domain}`,
    sourceUrl: `https://${domain}/report`,
    role,
    supportStrength: 'UNKNOWN',
    provenance: 'WEB_SEARCH',
    profileSnapshot: {
      profileData: { description: domain, methodVersion: 'source-profile-v1' },
      profileConfidence: 'HIGH',
      publicTrustLabel: 'strong',
    },
    profileVersion: 1,
    snapshotAt: new Date('2026-07-01T00:00:00.000Z'),
    position: 0,
    source: {
      domain,
      type: 'MEDIA',
      profileData: { description: domain },
      profileVersion: 1,
      profileConfidence: 'HIGH',
      lastProfiledAt: new Date('2026-07-01T00:00:00.000Z'),
      publicTrustLabel: 'strong',
    },
  };
}

function article(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Article ${id}`,
    slug: `article-${id}`,
    status: 'DRAFT',
    authorId: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    generatedAt: null,
    generationPrompt: null,
    generationVersion: 0,
    factCheckStatus: 'COMPLETED',
    factCheckScore: 70,
    factCheckData: null,
    factCheckContentHash: `hash-${id}`,
    articleSources: [],
    ...overrides,
  };
}

function clientFor(articles: ReturnType<typeof article>[]) {
  const findMany = vi.fn(async (args: any) => {
    const filtered = articles.filter((item) => (
      (!args.where?.status || item.status === args.where.status)
      && (!args.where?.articleSources?.some || item.articleSources.length > 0)
    ));
    const cursorIndex = args.cursor?.id
      ? filtered.findIndex((item) => item.id === args.cursor.id)
      : -1;
    return filtered.slice(cursorIndex + 1, cursorIndex + 1 + args.take);
  });
  return {
    client: { article: { findMany } } satisfies ArticleLightReportClient,
    findMany,
  };
}

const defaultOptions = {
  batchSize: 100,
  json: false,
  includeSamples: false,
};

describe('Article light analysis report', () => {
  it('aggregates support, confidence, deep reasons, and source averages', async () => {
    const fixture = clientFor([
      article('strong', {
        articleSources: [
          relation('one.test', 'PRIMARY_EVIDENCE'),
          relation('two.test'),
          relation('three.test'),
        ],
      }),
      article('fragile', { articleSources: [relation('single.test')] }),
      article('unverified', { factCheckData: 'malformed' }),
    ]);

    const report = await runArticleLightAnalysisReport(fixture.client, defaultOptions, vi.fn());

    expect(report.supportLevelDistribution).toEqual({ strong: 1, nuanced: 0, fragile: 1, unverified: 1 });
    expect(report.confidenceDistribution).toEqual({ HIGH: 1, MEDIUM: 0, LOW: 2 });
    expect(report.requiresDeepAnalysis).toEqual({ count: 2, percentage: 66.67 });
    expect(report.topDeepAnalysisReasons).toEqual(expect.arrayContaining([
      { reason: 'INSUFFICIENT_SOURCES', count: 2 },
      { reason: 'LOW_DOMAIN_DIVERSITY', count: 2 },
    ]));
    expect(report.sourceMetricsAverages).toEqual({
      totalSources: 1.33,
      usableSources: 1.33,
      uniqueDomains: 1.33,
      profileCoverage: 0.67,
    });
    expect(report.fallbackUsage).toEqual({ withArticleSource: 2, legacyFallback: 0, noSources: 1 });
    expect(report.errors).toBe(0);
  });

  it('respects --limit and --batch-size exactly', async () => {
    const fixture = clientFor([article('1'), article('2'), article('3')]);
    const options = parseArticleLightReportOptions(['--limit', '2', '--batch-size', '1']);

    const report = await runArticleLightAnalysisReport(fixture.client, options, vi.fn());

    expect(report.articlesScanned).toBe(2);
    expect(fixture.findMany).toHaveBeenCalledTimes(2);
    expect(fixture.findMany.mock.calls.every(([args]) => args.take === 1)).toBe(true);
  });

  it('passes the cursor to Prisma pagination', async () => {
    const fixture = clientFor([article('before'), article('after')]);
    const options = parseArticleLightReportOptions(['--cursor', 'before', '--batch-size', '5']);

    const report = await runArticleLightAnalysisReport(fixture.client, options, vi.fn());

    expect(fixture.findMany).toHaveBeenCalledWith(expect.objectContaining({
      cursor: { id: 'before' },
      skip: 1,
      take: 5,
    }));
    expect(report.articlesScanned).toBe(1);
    expect(report.lastCursor).toBe('after');
  });

  it('produces valid JSON and optional inspection samples', async () => {
    const fixture = clientFor([article('1')]);
    const options = parseArticleLightReportOptions(['--json', '--include-samples']);
    const report = await runArticleLightAnalysisReport(fixture.client, options, vi.fn());
    const output = formatArticleLightAnalysisReport(report, true);

    expect(() => JSON.parse(output)).not.toThrow();
    expect(JSON.parse(output).samples.unverified[0]).toMatchObject({ id: '1' });
  });

  it('respects the status filter and reports status and fact-check cohorts', async () => {
    const fixture = clientFor([
      article('published', { status: 'PUBLISHED', authorId: 'author-1', factCheckStatus: 'COMPLETED' }),
      article('draft', { status: 'DRAFT', factCheckStatus: null }),
    ]);
    const options = parseArticleLightReportOptions(['--status', 'PUBLISHED']);

    const report = await runArticleLightAnalysisReport(fixture.client, options, vi.fn());

    expect(report.articlesScanned).toBe(1);
    expect(report.statusDistribution).toEqual({ PUBLISHED: 1, DRAFT: 0, ARCHIVED: 0 });
    expect(report.factCheckStatusDistribution.COMPLETED).toBe(1);
    expect(report.authorship).toMatchObject({ withAuthor: 1, withoutAuthor: 0 });
    expect(fixture.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'PUBLISHED' }),
    }));
  });

  it.each([
    ['--with-sources', 2, ['relation', 'legacy']],
    ['--with-article-source', 1, ['relation']],
    ['--with-legacy-sources', 1, ['legacy']],
    ['--without-sources', 1, ['none']],
  ])('respects the %s cohort filter', async (flag, expectedCount, expectedIds) => {
    const fixture = clientFor([
      article('relation', { articleSources: [relation('relation.test')] }),
      article('legacy', { factCheckData: { sources: [{ url: 'https://legacy.test/report' }] } }),
      article('none'),
    ]);

    const report = await runArticleLightAnalysisReport(
      fixture.client,
      parseArticleLightReportOptions([flag, '--include-samples']),
      vi.fn(),
    );

    expect(report.articlesScanned).toBe(expectedCount);
    const sampleIds = Object.values(report.samples ?? {}).flat().map((sample) => sample.id);
    expect(new Set(sampleIds)).toEqual(new Set(expectedIds));
  });

  it('counts overlapping source cohorts without changing light-analysis rules', async () => {
    const fixture = clientFor([
      article('both', {
        status: 'PUBLISHED',
        articleSources: [relation('both.test')],
        factCheckData: { sources: [{ url: 'https://both.test/legacy' }] },
        generatedAt: new Date('2026-07-01T00:00:00.000Z'),
      }),
      article('legacy', { status: 'ARCHIVED', factCheckData: { sources: [{ url: 'https://legacy.test' }] } }),
      article('none', { factCheckStatus: null }),
    ]);

    const report = await runArticleLightAnalysisReport(fixture.client, defaultOptions, vi.fn());

    expect(report.fallbackUsage).toEqual({ withArticleSource: 1, legacyFallback: 1, noSources: 1 });
    expect(report.supportLevelByCohort.withArticleSource.fragile).toBe(1);
    expect(Object.values(report.supportLevelByCohort.withLegacySources).reduce((sum, count) => sum + count, 0)).toBe(2);
    expect(report.supportLevelByCohort.withoutSources.unverified).toBe(1);
    expect(report.statusDistribution).toEqual({ PUBLISHED: 1, DRAFT: 1, ARCHIVED: 1 });
    expect(report.factCheckStatusDistribution.NONE).toBe(1);
    expect(report.authorship.aiGenerated).toBe(1);
  });

  it('rejects unknown and positional CLI arguments', () => {
    expect(() => parseArticleLightReportOptions(['--unknown'])).toThrow(/Unexpected CLI argument/);
    expect(() => parseArticleLightReportOptions(['100'])).toThrow(/Unexpected CLI argument/);
    expect(() => parseArticleLightReportOptions(['--limit'])).toThrow(/requires a value/);
    expect(() => parseArticleLightReportOptions(['--status', 'DELETED'])).toThrow(/PUBLISHED, DRAFT, or ARCHIVED/);
    expect(() => parseArticleLightReportOptions(['--with-sources', '--without-sources'])).toThrow(/at most one/);
  });

  it('has no database write capability and tolerates malformed legacy JSON', async () => {
    const fixture = clientFor([article('1', { factCheckData: '{bad json' })]);
    const report = await runArticleLightAnalysisReport(fixture.client, defaultOptions, vi.fn());

    expect(Object.keys(fixture.client.article)).toEqual(['findMany']);
    expect(report.articlesScanned).toBe(1);
    expect(report.supportLevelDistribution.unverified).toBe(1);
    expect(report.errors).toBe(0);
  });
});
