import { describe, expect, it, vi } from 'vitest';
import {
  formatSourcePipelineReport,
  parseSourcePipelineReportOptions,
  runSourcePipelineReport,
  type SourcePipelineReportClient,
} from '../src/scripts/report-source-pipeline.js';

function relation(overrides: Record<string, unknown> = {}) {
  return {
    sourceId: 'source-a',
    sourceUrl: 'https://a.test/report',
    role: 'PRIMARY_EVIDENCE',
    supportStrength: 'UNKNOWN',
    profileSnapshot: {
      profileData: { profileSummary: 'Profil A', sourceFacts: { type: 'Média' } },
      profileConfidence: 'HIGH',
      publicTrustLabel: 'strong',
    },
    source: {
      domain: 'a.test', type: 'MEDIA', profileData: { profileSummary: 'Profil A' },
      profileConfidence: 'HIGH', publicTrustLabel: 'strong',
    },
    ...overrides,
  };
}

function article(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, title: `Article ${id}`, status: 'PUBLISHED', factCheckStatus: 'COMPLETED',
    factCheckContentHash: `hash-${id}`, factCheckData: null, articleSources: [],
    createdAt: new Date('2026-07-10T00:00:00.000Z'), ...overrides,
  };
}

function createClient(articles: any[], sources: any[]) {
  const articleFindMany = vi.fn(async (args: any) => paginate(
    articles.filter((item) => (!args.where?.status || item.status === args.where.status)), args,
  ));
  const sourceFindMany = vi.fn(async (args: any) => paginate(sources, args));
  return {
    client: { article: { findMany: articleFindMany }, source: { findMany: sourceFindMany } } satisfies SourcePipelineReportClient,
    articleFindMany,
    sourceFindMany,
  };
}

function paginate(rows: any[], args: any) {
  const cursorIndex = args.cursor?.id ? rows.findIndex((row) => row.id === args.cursor.id) : -1;
  return rows.slice(cursorIndex + 1, cursorIndex + 1 + args.take);
}

const options = { sampleLimit: 5, json: false, includeSamples: true };

describe('source pipeline operational report', () => {
  it('aggregates relations, partial backfills, extraction, profiles, and light analysis', async () => {
    const fixture = createClient([
      article('mixed', {
        articleSources: [relation()],
        factCheckData: { sources: [
          { url: 'https://a.test/report', domain: 'a.test', extractionStatus: 'full', profileData: { profileSummary: 'A' } },
          { url: 'https://b.test/context', domain: 'b.test', extractionStatus: 'metadata_only', type: 'MEDIA' },
        ] },
      }),
      article('legacy', {
        factCheckData: { sources: [
          { url: 'https://c.test/broken', domain: 'c.test', extractionStatus: 'failed', type: 'MEDIA' },
        ] },
      }),
      article('empty'),
    ], [
      {
        id: 'source-a', domain: 'a.test', profileConfidence: 'HIGH',
        profileData: {
          profileSummary: 'Profil A', sourceFacts: { type: 'Média' },
          editorialReputation: { editorialPolicy: 'Charte publiée' },
          externalReferences: [{ id: 'ref_1', label: 'Charte' }],
          claimReferences: { 'editorialReputation.editorialPolicy': ['ref_1'] },
        },
      },
      { id: 'source-c', domain: 'c.test', profileConfidence: 'LOW', profileData: null },
      {
        id: 'source-risk', domain: 'risk.test', profileConfidence: 'MEDIUM',
        profileData: {
          profileSummary: 'Profil ancien',
          editorialReputation: { misinformationSignals: ['Accusation non reliée'] },
          externalReferences: [{ id: 'ref_1', label: 'Notice' }],
        },
      },
    ]);

    const report = await runSourcePipelineReport(fixture.client, options, vi.fn());

    expect(report.articles).toEqual({ total: 3, withArticleSource: 1, legacyOnly: 1, mixed: 1, withoutSources: 1 });
    expect(report.articleSources.totalRelations).toBe(1);
    expect(report.articleSources.roleDistribution.PRIMARY_EVIDENCE).toEqual({ count: 1, percentage: 100 });
    expect(report.articleSources.supportStrengthUnknown).toEqual({ count: 1, percentage: 100 });
    expect(report.articleSources.domainsWithoutDurableSource).toEqual({ count: 1, domains: ['b.test'] });
    expect(report.backfill).toEqual({
      articlesWithUnlinkedLegacySources: 2,
      articlesWithMergeCountDifference: 2,
      probablyPartialBackfill: 1,
    });
    expect(report.extraction.distribution).toMatchObject({
      FULL: { count: 1 }, METADATA_ONLY: { count: 1 }, UNAVAILABLE: { count: 1 }, UNKNOWN: { count: 0 },
    });
    expect(report.profiles).toMatchObject({
      totalSources: 3, withoutProfileData: 1, withClaimReferences: 1,
      sensitiveClaimsWithoutClaimReferences: 1,
      confidenceDistribution: { LOW: 1, MEDIUM: 1, HIGH: 1, UNKNOWN: 0 },
    });
    expect(report.lightAnalysis.supportLevelDistribution).toEqual({ strong: 0, nuanced: 1, fragile: 0, unverified: 2 });
    expect(report.lightAnalysis.keyReasonRates).toHaveProperty('SOURCE_PROFILE_INCOMPLETE');
    expect(report.lightAnalysis.keyReasonRates).toHaveProperty('LOW_SOURCE_REPUTATION');
    expect(report.lightAnalysis.keyReasonRates).toHaveProperty('INCOMPLETE_EXTRACTION');
    expect(report.lightAnalysis.reasonsSeparated).toBe(true);
    expect(report.samples?.backfillAnomalies).toHaveLength(2);
  });

  it('parses filters and produces JSON', async () => {
    const parsed = parseSourcePipelineReportOptions([
      '--limit', '2', '--status', 'PUBLISHED', '--from', '2026-07-01', '--to', '2026-07-31', '--json', '--include-samples',
    ]);
    expect(parsed).toMatchObject({ sampleLimit: 2, status: 'PUBLISHED', json: true, includeSamples: true });

    const fixture = createClient([], []);
    const report = await runSourcePipelineReport(fixture.client, parsed, vi.fn());
    expect(() => JSON.parse(formatSourcePipelineReport(report, true))).not.toThrow();
    expect(fixture.articleFindMany.mock.calls[0][0].where).toMatchObject({ status: 'PUBLISHED' });
  });

  it('exposes read-only clients only and rejects unsafe CLI arguments', async () => {
    expect(() => parseSourcePipelineReportOptions(['--unknown'])).toThrow('Unexpected CLI argument');
    expect(() => parseSourcePipelineReportOptions(['--status', 'DELETED'])).toThrow('PUBLISHED, DRAFT, or ARCHIVED');
    expect(() => parseSourcePipelineReportOptions(['--from', '2026-08-01', '--to', '2026-07-01'])).toThrow('--from');

    const fixture = createClient([], []);
    const report = await runSourcePipelineReport(fixture.client, options, vi.fn());
    expect(report.readOnly).toBe(true);
    expect(fixture.client.article).not.toHaveProperty('update');
    expect(fixture.client.source).not.toHaveProperty('update');
  });
});
