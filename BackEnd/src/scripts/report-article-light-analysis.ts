import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/db.js';
import { buildArticleLightAnalysis } from '../lib/article-light-analysis.js';
import type {
  ArticleLightAnalysisConfidence,
  ArticleLightAnalysisV1,
  ArticleLightSupportLevel,
} from '../lib/score-types.js';

export interface ArticleLightReportOptions {
  limit?: number;
  batchSize: number;
  cursor?: string;
  json: boolean;
  includeSamples: boolean;
  status?: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  sourceFilter?: 'with-sources' | 'with-article-source' | 'with-legacy-sources' | 'without-sources';
}

export interface ArticleLightReportClient {
  article: {
    findMany(args: any): Promise<ReportArticle[]>;
  };
}

export interface ArticleLightAnalysisReport {
  articlesScanned: number;
  databaseRowsRead: number;
  statusDistribution: Record<'PUBLISHED' | 'DRAFT' | 'ARCHIVED', number>;
  factCheckStatusDistribution: Record<'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STALE' | 'NONE', number>;
  supportLevelDistribution: Record<ArticleLightSupportLevel, number>;
  confidenceDistribution: Record<ArticleLightAnalysisConfidence, number>;
  requiresDeepAnalysis: { count: number; percentage: number };
  topDeepAnalysisReasons: Array<{ reason: string; count: number }>;
  sourceMetricsAverages: {
    totalSources: number;
    usableSources: number;
    uniqueDomains: number;
    profileCoverage: number;
  };
  fallbackUsage: {
    withArticleSource: number;
    legacyFallback: number;
    noSources: number;
  };
  authorship: { withAuthor: number; withoutAuthor: number; aiGenerated: number };
  supportLevelByCohort: {
    withArticleSource: Record<ArticleLightSupportLevel, number>;
    withLegacySources: Record<ArticleLightSupportLevel, number>;
    withoutSources: Record<ArticleLightSupportLevel, number>;
  };
  inspectionCases: {
    unverified: number;
    fragile: number;
    strongRequiringDeep: number;
    withoutArticleSource: number;
    legacyFallback: number;
    incompleteSources: number;
  };
  samples?: Record<string, ArticleLightReportSample[]>;
  lastCursor: string | null;
  errors: number;
}

interface ReportArticle {
  id: string;
  title: string;
  slug: string | null;
  factCheckStatus: string | null;
  factCheckScore: number | null;
  factCheckData: unknown;
  factCheckContentHash: string | null;
  status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  authorId: string | null;
  createdAt: Date;
  generatedAt: Date | null;
  generationPrompt: string | null;
  generationVersion: number;
  articleSources: Array<Record<string, any>>;
}

interface ArticleLightReportSample {
  id: string;
  title: string;
  slug: string | null;
  supportLevel: ArticleLightSupportLevel;
  analysisConfidence: ArticleLightAnalysisConfidence;
  requiresDeepAnalysis: boolean;
  deepAnalysisReasons: string[];
}

type Log = (message: string) => void;

const SAMPLE_LIMIT = 10;

export function parseArticleLightReportOptions(argv: string[]): ArticleLightReportOptions {
  assertKnownArguments(argv);
  return {
    limit: readPositiveIntegerOption(argv, '--limit'),
    batchSize: readPositiveIntegerOption(argv, '--batch-size') ?? 100,
    cursor: readStringOption(argv, '--cursor'),
    json: argv.includes('--json'),
    includeSamples: argv.includes('--include-samples'),
    status: readStatusOption(argv),
    sourceFilter: readSourceFilter(argv),
  };
}

export async function runArticleLightAnalysisReport(
  client: ArticleLightReportClient,
  options: ArticleLightReportOptions,
  log: Log = console.log,
): Promise<ArticleLightAnalysisReport> {
  const report = emptyReport(options.cursor);
  const reasonCounts = new Map<string, number>();
  const metricTotals = { totalSources: 0, usableSources: 0, uniqueDomains: 0, profileCoverage: 0 };
  const analyzedAt = new Date().toISOString();
  let cursor = options.cursor;

  while (options.limit === undefined || report.articlesScanned < options.limit) {

    let articles: ReportArticle[];
    try {
      const rows = await client.article.findMany({
        take: options.batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        where: {
          ...(options.status ? { status: options.status } : {}),
          ...(options.sourceFilter === 'with-article-source'
            ? { articleSources: { some: {} } }
            : {}),
        },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          title: true,
          slug: true,
          factCheckStatus: true,
          factCheckScore: true,
          factCheckData: true,
          factCheckContentHash: true,
          status: true,
          authorId: true,
          createdAt: true,
          generatedAt: true,
          generationPrompt: true,
          generationVersion: true,
          articleSources: {
            orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
            select: {
              sourceId: true,
              sourceUrl: true,
              role: true,
              supportStrength: true,
              provenance: true,
              profileSnapshot: true,
              profileVersion: true,
              snapshotAt: true,
              position: true,
              source: {
                select: {
                  domain: true,
                  type: true,
                  profileData: true,
                  profileVersion: true,
                  profileConfidence: true,
                  lastProfiledAt: true,
                  publicTrustLabel: true,
                },
              },
            },
          },
        },
      });
      articles = rows;
    } catch (error) {
      report.errors++;
      log(`[ERROR] Article light report batch failed: ${errorMessage(error)}`);
      break;
    }

    if (articles.length === 0) break;

    report.databaseRowsRead += articles.length;
    let includedInBatch = 0;
    for (const article of articles) {
      if (!matchesSourceFilter(article, options.sourceFilter)) continue;
      if (options.limit !== undefined && report.articlesScanned >= options.limit) break;
      const analysis = buildArticleLightAnalysis({
        articleSources: article.articleSources,
        factCheckData: article.factCheckData,
        contentHash: article.factCheckContentHash ?? readContentHash(article.factCheckData),
        factCheckStatus: article.factCheckStatus,
        analyzedAt,
      });
      aggregateArticle(report, metricTotals, reasonCounts, article, analysis, options.includeSamples);
      report.articlesScanned++;
      includedInBatch++;
    }

    cursor = articles[articles.length - 1].id;
    report.lastCursor = cursor;
    if (!options.json) {
      log(`[READ-ONLY] Batch complete: read=${articles.length}, included=${includedInBatch}, cursor=${cursor}`);
    }
    if (articles.length < options.batchSize) break;
  }

  report.requiresDeepAnalysis.percentage = percentage(
    report.requiresDeepAnalysis.count,
    report.articlesScanned,
  );
  report.topDeepAnalysisReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
  report.sourceMetricsAverages = {
    totalSources: average(metricTotals.totalSources, report.articlesScanned),
    usableSources: average(metricTotals.usableSources, report.articlesScanned),
    uniqueDomains: average(metricTotals.uniqueDomains, report.articlesScanned),
    profileCoverage: average(metricTotals.profileCoverage, report.articlesScanned),
  };

  return report;
}

export function formatArticleLightAnalysisReport(
  report: ArticleLightAnalysisReport,
  json: boolean,
): string {
  if (json) return JSON.stringify(report, null, 2);

  const reasons = report.topDeepAnalysisReasons.length > 0
    ? report.topDeepAnalysisReasons.map((item) => `  ${item.reason}: ${item.count}`).join('\n')
    : '  none';
  return [
    'Article light analysis report',
    `articles scanned: ${report.articlesScanned}`,
    `database rows read: ${report.databaseRowsRead}`,
    'status distribution:',
    `  PUBLISHED: ${report.statusDistribution.PUBLISHED}`,
    `  DRAFT: ${report.statusDistribution.DRAFT}`,
    `  ARCHIVED: ${report.statusDistribution.ARCHIVED}`,
    'factCheckStatus distribution:',
    `  PENDING: ${report.factCheckStatusDistribution.PENDING}`,
    `  RUNNING: ${report.factCheckStatusDistribution.RUNNING}`,
    `  COMPLETED: ${report.factCheckStatusDistribution.COMPLETED}`,
    `  FAILED: ${report.factCheckStatusDistribution.FAILED}`,
    `  STALE: ${report.factCheckStatusDistribution.STALE}`,
    `  NONE: ${report.factCheckStatusDistribution.NONE}`,
    'supportLevel distribution:',
    `  strong: ${report.supportLevelDistribution.strong}`,
    `  nuanced: ${report.supportLevelDistribution.nuanced}`,
    `  fragile: ${report.supportLevelDistribution.fragile}`,
    `  unverified: ${report.supportLevelDistribution.unverified}`,
    'confidence distribution:',
    `  HIGH: ${report.confidenceDistribution.HIGH}`,
    `  MEDIUM: ${report.confidenceDistribution.MEDIUM}`,
    `  LOW: ${report.confidenceDistribution.LOW}`,
    `requiresDeepAnalysis: ${report.requiresDeepAnalysis.count} (${report.requiresDeepAnalysis.percentage}%)`,
    'top deep reasons:',
    reasons,
    'source metrics averages:',
    `  totalSources: ${report.sourceMetricsAverages.totalSources}`,
    `  usableSources: ${report.sourceMetricsAverages.usableSources}`,
    `  uniqueDomains: ${report.sourceMetricsAverages.uniqueDomains}`,
    `  profileCoverage: ${report.sourceMetricsAverages.profileCoverage}`,
    'fallback usage:',
    `  with ArticleSource: ${report.fallbackUsage.withArticleSource}`,
    `  legacy fallback: ${report.fallbackUsage.legacyFallback}`,
    `  no sources: ${report.fallbackUsage.noSources}`,
    'authorship:',
    `  with author: ${report.authorship.withAuthor}`,
    `  without author: ${report.authorship.withoutAuthor}`,
    `  AI generated: ${report.authorship.aiGenerated}`,
    'supportLevel by source cohort:',
    `  with ArticleSource: ${formatDistribution(report.supportLevelByCohort.withArticleSource)}`,
    `  with legacy sources: ${formatDistribution(report.supportLevelByCohort.withLegacySources)}`,
    `  without sources: ${formatDistribution(report.supportLevelByCohort.withoutSources)}`,
    'inspection cases:',
    `  unverified: ${report.inspectionCases.unverified}`,
    `  fragile: ${report.inspectionCases.fragile}`,
    `  strong requiring deep: ${report.inspectionCases.strongRequiringDeep}`,
    `  without ArticleSource: ${report.inspectionCases.withoutArticleSource}`,
    `  legacy fallback: ${report.inspectionCases.legacyFallback}`,
    `  incomplete sources: ${report.inspectionCases.incompleteSources}`,
    `last cursor: ${report.lastCursor ?? 'none'}`,
    `errors: ${report.errors}`,
    ...(report.samples ? ['samples:', JSON.stringify(report.samples, null, 2)] : []),
  ].join('\n');
}

function aggregateArticle(
  report: ArticleLightAnalysisReport,
  metrics: { totalSources: number; usableSources: number; uniqueDomains: number; profileCoverage: number },
  reasonCounts: Map<string, number>,
  article: ReportArticle,
  analysis: ArticleLightAnalysisV1,
  includeSamples: boolean,
): void {
  report.supportLevelDistribution[analysis.supportLevel]++;
  report.confidenceDistribution[analysis.analysisConfidence]++;
  report.statusDistribution[article.status]++;
  const factCheckStatus = normalizeFactCheckStatus(article.factCheckStatus);
  report.factCheckStatusDistribution[factCheckStatus]++;
  if (analysis.deepAnalysisRecommended) report.requiresDeepAnalysis.count++;
  for (const reason of analysis.deepAnalysisReasons) {
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  metrics.totalSources += analysis.sourceQualitySummary.totalSources;
  metrics.usableSources += analysis.sourceQualitySummary.usableSources;
  metrics.uniqueDomains += analysis.sourceQualitySummary.uniqueDomains;
  metrics.profileCoverage += analysis.sourceQualitySummary.profileCoverage;

  const legacySourceCount = readLegacySources(article.factCheckData).length;
  const hasArticleSource = article.articleSources.length > 0;
  if (hasArticleSource) {
    report.fallbackUsage.withArticleSource++;
    report.supportLevelByCohort.withArticleSource[analysis.supportLevel]++;
    addSample(report, 'withArticleSource', toSample(article, analysis), includeSamples);
  }
  if (legacySourceCount > 0) {
    if (!hasArticleSource) report.fallbackUsage.legacyFallback++;
    report.supportLevelByCohort.withLegacySources[analysis.supportLevel]++;
    addSample(report, 'withLegacySources', toSample(article, analysis), includeSamples);
  }
  if (!hasArticleSource && legacySourceCount === 0) {
    report.fallbackUsage.noSources++;
    report.supportLevelByCohort.withoutSources[analysis.supportLevel]++;
    addSample(report, 'withoutSources', toSample(article, analysis), includeSamples);
  }
  if (article.authorId) report.authorship.withAuthor++;
  else report.authorship.withoutAuthor++;
  if (article.generationVersion > 0 || article.generatedAt || article.generationPrompt) {
    report.authorship.aiGenerated++;
  }

  const sample = toSample(article, analysis);
  if (analysis.supportLevel === 'unverified') {
    report.inspectionCases.unverified++;
    addSample(report, 'unverified', sample, includeSamples);
  }
  if (analysis.supportLevel === 'fragile') {
    report.inspectionCases.fragile++;
    addSample(report, 'fragile', sample, includeSamples);
  }
  if (analysis.supportLevel === 'strong' && analysis.deepAnalysisRecommended) {
    report.inspectionCases.strongRequiringDeep++;
    addSample(report, 'strongRequiringDeep', sample, includeSamples);
  }
  if (article.articleSources.length === 0) {
    report.inspectionCases.withoutArticleSource++;
    addSample(report, 'withoutArticleSource', sample, includeSamples);
  }
  if (article.articleSources.length === 0 && legacySourceCount > 0) {
    report.inspectionCases.legacyFallback++;
    addSample(report, 'legacyFallback', sample, includeSamples);
  }
  if (
    analysis.sourceQualitySummary.metadataOnlyCount > 0
    || analysis.sourceQualitySummary.unavailableCount > 0
  ) {
    report.inspectionCases.incompleteSources++;
    addSample(report, 'incompleteSources', sample, includeSamples);
  }
}

function emptyReport(cursor?: string): ArticleLightAnalysisReport {
  return {
    articlesScanned: 0,
    databaseRowsRead: 0,
    statusDistribution: { PUBLISHED: 0, DRAFT: 0, ARCHIVED: 0 },
    factCheckStatusDistribution: { PENDING: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0, STALE: 0, NONE: 0 },
    supportLevelDistribution: { strong: 0, nuanced: 0, fragile: 0, unverified: 0 },
    confidenceDistribution: { HIGH: 0, MEDIUM: 0, LOW: 0 },
    requiresDeepAnalysis: { count: 0, percentage: 0 },
    topDeepAnalysisReasons: [],
    sourceMetricsAverages: { totalSources: 0, usableSources: 0, uniqueDomains: 0, profileCoverage: 0 },
    fallbackUsage: { withArticleSource: 0, legacyFallback: 0, noSources: 0 },
    authorship: { withAuthor: 0, withoutAuthor: 0, aiGenerated: 0 },
    supportLevelByCohort: {
      withArticleSource: emptySupportDistribution(),
      withLegacySources: emptySupportDistribution(),
      withoutSources: emptySupportDistribution(),
    },
    inspectionCases: {
      unverified: 0,
      fragile: 0,
      strongRequiringDeep: 0,
      withoutArticleSource: 0,
      legacyFallback: 0,
      incompleteSources: 0,
    },
    lastCursor: cursor ?? null,
    errors: 0,
  };
}

function toSample(article: ReportArticle, analysis: ArticleLightAnalysisV1): ArticleLightReportSample {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    supportLevel: analysis.supportLevel,
    analysisConfidence: analysis.analysisConfidence,
    requiresDeepAnalysis: analysis.deepAnalysisRecommended,
    deepAnalysisReasons: analysis.deepAnalysisReasons,
  };
}

function addSample(
  report: ArticleLightAnalysisReport,
  category: string,
  sample: ArticleLightReportSample,
  enabled: boolean,
): void {
  if (!enabled) return;
  report.samples ??= {};
  const samples = report.samples[category] ??= [];
  if (samples.length < SAMPLE_LIMIT) samples.push(sample);
}

function readLegacySources(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const sources = (value as Record<string, unknown>).sources;
  return Array.isArray(sources)
    ? sources.filter((source): source is Record<string, unknown> => Boolean(source && typeof source === 'object' && !Array.isArray(source)))
    : [];
}

function readContentHash(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const contentHash = (value as Record<string, unknown>).contentHash;
  return typeof contentHash === 'string' && contentHash.trim() ? contentHash.trim() : null;
}

function assertKnownArguments(argv: string[]): void {
  const flags = new Set([
    '--json',
    '--include-samples',
    '--with-sources',
    '--with-article-source',
    '--with-legacy-sources',
    '--without-sources',
  ]);
  const valued = new Set(['--limit', '--batch-size', '--cursor', '--status']);
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (flags.has(argument)) continue;
    if (valued.has(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      index++;
      continue;
    }
    throw new Error(`Unexpected CLI argument: ${argument}. Use named options only.`);
  }
}

function readStatusOption(argv: string[]): ArticleLightReportOptions['status'] {
  const value = readStringOption(argv, '--status');
  if (value === undefined) return undefined;
  if (!['PUBLISHED', 'DRAFT', 'ARCHIVED'].includes(value)) {
    throw new Error('--status must be PUBLISHED, DRAFT, or ARCHIVED.');
  }
  return value as ArticleLightReportOptions['status'];
}

function readSourceFilter(argv: string[]): ArticleLightReportOptions['sourceFilter'] {
  const filters = [
    ['--with-sources', 'with-sources'],
    ['--with-article-source', 'with-article-source'],
    ['--with-legacy-sources', 'with-legacy-sources'],
    ['--without-sources', 'without-sources'],
  ] as const;
  const selected = filters.filter(([flag]) => argv.includes(flag));
  if (selected.length > 1) throw new Error('Choose at most one source cohort filter.');
  return selected[0]?.[1];
}

function matchesSourceFilter(
  article: ReportArticle,
  filter: ArticleLightReportOptions['sourceFilter'],
): boolean {
  if (!filter) return true;
  const hasArticleSource = article.articleSources.length > 0;
  const hasLegacySources = readLegacySources(article.factCheckData).length > 0;
  if (filter === 'with-sources') return hasArticleSource || hasLegacySources;
  if (filter === 'with-article-source') return hasArticleSource;
  if (filter === 'with-legacy-sources') return hasLegacySources;
  return !hasArticleSource && !hasLegacySources;
}

function normalizeFactCheckStatus(value: unknown): keyof ArticleLightAnalysisReport['factCheckStatusDistribution'] {
  return ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'STALE'].includes(String(value))
    ? String(value) as keyof ArticleLightAnalysisReport['factCheckStatusDistribution']
    : 'NONE';
}

function emptySupportDistribution(): Record<ArticleLightSupportLevel, number> {
  return { strong: 0, nuanced: 0, fragile: 0, unverified: 0 };
}

function formatDistribution(distribution: Record<ArticleLightSupportLevel, number>): string {
  return `strong=${distribution.strong}, nuanced=${distribution.nuanced}, fragile=${distribution.fragile}, unverified=${distribution.unverified}`;
}

function readPositiveIntegerOption(argv: string[], name: string): number | undefined {
  const raw = readStringOption(argv, name);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function readStringOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index < 0 ? undefined : argv[index + 1];
}

function average(total: number, count: number): number {
  return count > 0 ? Math.round((total / count) * 100) / 100 : 0;
}

function percentage(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 10000) / 100 : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const options = parseArticleLightReportOptions(process.argv.slice(2));
  try {
    const report = await runArticleLightAnalysisReport(
      prisma as unknown as ArticleLightReportClient,
      options,
    );
    console.log(formatArticleLightAnalysisReport(report, options.json));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
