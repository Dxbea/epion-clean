import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/db.js';
import { buildArticleLightAnalysis } from '../lib/article-light-analysis.js';
import { normalizeArticleSourceUrl } from '../lib/article-source-service.js';
import { normalizeSourceDomain } from '../lib/source-profile.js';

const BATCH_SIZE = 250;
const ROLES = ['PRIMARY_EVIDENCE', 'CONTEXT', 'COUNTERPOINT', 'OFFICIAL_STATEMENT', 'BACKGROUND', 'UNKNOWN'] as const;
const CONFIDENCES = ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'] as const;
const EXTRACTION_STATES = ['FULL', 'METADATA_ONLY', 'UNAVAILABLE', 'UNKNOWN'] as const;

export interface SourcePipelineReportOptions {
  sampleLimit: number;
  status?: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  from?: Date;
  to?: Date;
  json: boolean;
  includeSamples: boolean;
}

export interface SourcePipelineReportClient {
  article: { findMany(args: any): Promise<any[]> };
  source: { findMany(args: any): Promise<any[]> };
}

export interface SourcePipelineReport {
  generatedAt: string;
  readOnly: true;
  filters: { status: string | null; from: string | null; to: string | null };
  articles: {
    total: number;
    withArticleSource: number;
    legacyOnly: number;
    mixed: number;
    withoutSources: number;
  };
  articleSources: {
    totalRelations: number;
    roleDistribution: Record<string, { count: number; percentage: number }>;
    supportStrengthUnknown: { count: number; percentage: number };
    topDomains: Array<{ domain: string; count: number }>;
    domainsWithoutDurableSource: { count: number; domains: string[] };
  };
  backfill: {
    articlesWithUnlinkedLegacySources: number;
    articlesWithMergeCountDifference: number;
    probablyPartialBackfill: number;
  };
  extraction: {
    distribution: Record<string, { count: number; percentage: number }>;
    articlesMostlyMetadataOnly: number;
  };
  profiles: {
    totalSources: number;
    confidenceDistribution: Record<string, number>;
    withoutProfileData: number;
    withoutProfileSummary: number;
    withoutSourceFacts: number;
    withoutEditorialReputation: number;
    withoutExternalReferences: number;
    withClaimReferences: number;
    sensitiveClaimsWithoutClaimReferences: number;
  };
  lightAnalysis: {
    supportLevelDistribution: Record<string, number>;
    confidenceDistribution: Record<string, number>;
    deepAnalysisRecommended: { count: number; percentage: number };
    reasonDistribution: Record<string, number>;
    keyReasonRates: Record<string, { count: number; percentage: number }>;
    reasonsSeparated: boolean;
  };
  samples?: Record<string, Array<Record<string, unknown>>>;
  errors: number;
}

export function parseSourcePipelineReportOptions(argv: string[]): SourcePipelineReportOptions {
  assertKnownArguments(argv);
  const status = readStringOption(argv, '--status');
  if (status && !['PUBLISHED', 'DRAFT', 'ARCHIVED'].includes(status)) {
    throw new Error('--status must be PUBLISHED, DRAFT, or ARCHIVED.');
  }
  const from = readDateOption(argv, '--from');
  const to = readDateOption(argv, '--to');
  if (from && to && from > to) throw new Error('--from must be before or equal to --to.');
  return {
    sampleLimit: readPositiveIntegerOption(argv, '--limit') ?? 10,
    status: status as SourcePipelineReportOptions['status'],
    from,
    to,
    json: argv.includes('--json'),
    includeSamples: argv.includes('--include-samples'),
  };
}

export async function runSourcePipelineReport(
  client: SourcePipelineReportClient,
  options: SourcePipelineReportOptions,
  log: (message: string) => void = console.log,
): Promise<SourcePipelineReport> {
  const report = emptyReport(options);
  const roleCounts = countRecord(ROLES);
  const extractionCounts = countRecord(EXTRACTION_STATES);
  const domainCounts = new Map<string, number>();
  const legacyDomains = new Set<string>();
  const durableDomains = new Set<string>();
  const reasonCounts = new Map<string, number>();
  let articleCursor: string | undefined;

  while (true) {
    let articles: any[];
    try {
      articles = await client.article.findMany({
        take: BATCH_SIZE,
        ...(articleCursor ? { cursor: { id: articleCursor }, skip: 1 } : {}),
        where: articleWhere(options),
        orderBy: { id: 'asc' },
        select: articleSelect(),
      });
    } catch (error) {
      report.errors++;
      log(`[ERROR] Article report read failed: ${errorMessage(error)}`);
      break;
    }
    if (articles.length === 0) break;

    for (const article of articles) {
      aggregateArticle(report, article, roleCounts, extractionCounts, domainCounts, legacyDomains, reasonCounts, options);
    }
    articleCursor = articles[articles.length - 1]?.id;
    if (articles.length < BATCH_SIZE) break;
  }

  let sourceCursor: string | undefined;
  while (true) {
    let sources: any[];
    try {
      sources = await client.source.findMany({
        take: BATCH_SIZE,
        ...(sourceCursor ? { cursor: { id: sourceCursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true, domain: true, profileData: true, profileConfidence: true,
        },
      });
    } catch (error) {
      report.errors++;
      log(`[ERROR] Source profile report read failed: ${errorMessage(error)}`);
      break;
    }
    if (sources.length === 0) break;
    for (const source of sources) aggregateProfile(report, source, durableDomains, options);
    sourceCursor = sources[sources.length - 1]?.id;
    if (sources.length < BATCH_SIZE) break;
  }

  const missingDomains = [...legacyDomains].filter((domain) => !durableDomains.has(domain)).sort();
  report.articleSources.domainsWithoutDurableSource = { count: missingDomains.length, domains: missingDomains };
  report.articleSources.roleDistribution = rateRecord(roleCounts, report.articleSources.totalRelations);
  report.articleSources.supportStrengthUnknown.percentage = percentage(
    report.articleSources.supportStrengthUnknown.count,
    report.articleSources.totalRelations,
  );
  report.articleSources.topDomains = [...domainCounts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((left, right) => right.count - left.count || left.domain.localeCompare(right.domain))
    .slice(0, 20);
  report.extraction.distribution = rateRecord(extractionCounts, sumRecord(extractionCounts));
  report.lightAnalysis.reasonDistribution = Object.fromEntries(
    [...reasonCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  );
  for (const reason of ['SOURCE_PROFILE_INCOMPLETE', 'LOW_SOURCE_REPUTATION', 'INCOMPLETE_EXTRACTION']) {
    const count = reasonCounts.get(reason) ?? 0;
    report.lightAnalysis.keyReasonRates[reason] = { count, percentage: percentage(count, report.articles.total) };
  }
  report.lightAnalysis.deepAnalysisRecommended.percentage = percentage(
    report.lightAnalysis.deepAnalysisRecommended.count,
    report.articles.total,
  );
  report.lightAnalysis.reasonsSeparated = ['SOURCE_PROFILE_INCOMPLETE', 'LOW_SOURCE_REPUTATION', 'INCOMPLETE_EXTRACTION']
    .every((reason) => Object.prototype.hasOwnProperty.call(report.lightAnalysis.keyReasonRates, reason));
  return report;
}

function aggregateArticle(
  report: SourcePipelineReport,
  article: any,
  roleCounts: Record<string, number>,
  extractionCounts: Record<string, number>,
  domainCounts: Map<string, number>,
  legacyDomains: Set<string>,
  reasonCounts: Map<string, number>,
  options: SourcePipelineReportOptions,
): void {
  report.articles.total++;
  const relations = Array.isArray(article.articleSources) ? article.articleSources : [];
  const legacy = readLegacySources(article.factCheckData);
  const hasRelations = relations.length > 0;
  const hasLegacy = legacy.length > 0;
  if (hasRelations) report.articles.withArticleSource++;
  if (hasRelations && hasLegacy) report.articles.mixed++;
  else if (hasLegacy) report.articles.legacyOnly++;
  else if (!hasRelations) report.articles.withoutSources++;

  report.articleSources.totalRelations += relations.length;
  for (const relation of relations) {
    const role = ROLES.includes(relation.role) ? relation.role : 'UNKNOWN';
    roleCounts[role]++;
    if (relation.supportStrength === 'UNKNOWN' || !relation.supportStrength) {
      report.articleSources.supportStrengthUnknown.count++;
    }
    const domain = normalizeSourceDomain(relation.source?.domain ?? relation.sourceUrl);
    if (domain) domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
  }

  const relationUrls = new Set(relations.map((relation: any) => normalizeArticleSourceUrl(relation.sourceUrl)).filter(Boolean));
  const legacyUrls = new Set<string>();
  let metadataOnly = 0;
  for (const source of legacy) {
    const url = normalizeArticleSourceUrl(source.url);
    if (url) legacyUrls.add(url);
    const domain = normalizeSourceDomain(source.domain ?? source.url);
    if (domain) {
      legacyDomains.add(domain);
      if (!url || !relationUrls.has(url)) domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    }
    const extraction = extractionState(source);
    extractionCounts[extraction]++;
    if (extraction === 'METADATA_ONLY') metadataOnly++;
  }
  for (const relation of relations) {
    if (!legacyUrls.has(normalizeArticleSourceUrl(relation.sourceUrl) ?? '')) extractionCounts.UNKNOWN++;
  }
  const unlinkedLegacy = [...legacyUrls].filter((url) => !relationUrls.has(url)).length;
  const apiMergeCount = new Set([...relationUrls, ...legacyUrls]).size;
  const difference = apiMergeCount - relations.length;
  if (unlinkedLegacy > 0) report.backfill.articlesWithUnlinkedLegacySources++;
  if (difference !== 0) report.backfill.articlesWithMergeCountDifference++;
  if (hasRelations && unlinkedLegacy > 0) report.backfill.probablyPartialBackfill++;
  if (legacy.length > 0 && metadataOnly / legacy.length >= 0.5) report.extraction.articlesMostlyMetadataOnly++;

  if (unlinkedLegacy > 0 || difference !== 0) {
    addSample(report, 'backfillAnomalies', {
      articleId: article.id, title: article.title, legacyCount: legacy.length,
      articleSourceCount: relations.length, apiMergeCount, difference, unlinkedLegacy,
    }, options);
  }
  if (legacy.length > 0 && metadataOnly / legacy.length >= 0.5) {
    addSample(report, 'weakExtraction', {
      articleId: article.id, title: article.title, legacyCount: legacy.length, metadataOnly,
    }, options);
  }

  const light = buildArticleLightAnalysis({
    articleSources: relations,
    factCheckData: article.factCheckData,
    contentHash: article.factCheckContentHash,
    factCheckStatus: article.factCheckStatus,
    analyzedAt: report.generatedAt,
  });
  report.lightAnalysis.supportLevelDistribution[light.supportLevel]++;
  report.lightAnalysis.confidenceDistribution[light.analysisConfidence]++;
  if (light.deepAnalysisRecommended) report.lightAnalysis.deepAnalysisRecommended.count++;
  for (const reason of light.deepAnalysisReasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
}

function aggregateProfile(
  report: SourcePipelineReport,
  source: any,
  durableDomains: Set<string>,
  options: SourcePipelineReportOptions,
): void {
  report.profiles.totalSources++;
  const domain = normalizeSourceDomain(source.domain);
  if (domain) durableDomains.add(domain);
  const confidence = CONFIDENCES.includes(source.profileConfidence) ? source.profileConfidence : 'UNKNOWN';
  report.profiles.confidenceDistribution[confidence]++;
  const profile = asRecord(source.profileData);
  if (Object.keys(profile).length === 0) report.profiles.withoutProfileData++;
  if (!cleanText(profile.profileSummary)) report.profiles.withoutProfileSummary++;
  if (Object.keys(asRecord(profile.sourceFacts)).length === 0) report.profiles.withoutSourceFacts++;
  if (Object.keys(asRecord(profile.editorialReputation)).length === 0) report.profiles.withoutEditorialReputation++;
  if (!hasNonEmptyArray(profile.externalReferences)) report.profiles.withoutExternalReferences++;
  if (Object.keys(asRecord(profile.claimReferences)).length > 0) report.profiles.withClaimReferences++;
  if (hasUnreferencedSensitiveClaims(profile)) {
    report.profiles.sensitiveClaimsWithoutClaimReferences++;
    addSample(report, 'profilesWithUnreferencedSensitiveClaims', {
      sourceId: source.id, domain: source.domain,
    }, options);
  }
}

export function formatSourcePipelineReport(report: SourcePipelineReport, json: boolean): string {
  if (json) return JSON.stringify(report, null, 2);
  return [
    'Source pipeline operational report (strictly read-only)',
    `articles: ${report.articles.total}`,
    `ArticleSource relations: ${report.articleSources.totalRelations}`,
    `legacy only: ${report.articles.legacyOnly} | mixed: ${report.articles.mixed}`,
    `partial backfills: ${report.backfill.probablyPartialBackfill}`,
    `domains without durable Source: ${report.articleSources.domainsWithoutDurableSource.count}`,
    `roles: ${formatRates(report.articleSources.roleDistribution)}`,
    `extraction: ${formatRates(report.extraction.distribution)}`,
    `Source profiles: ${report.profiles.totalSources} | missing profileData: ${report.profiles.withoutProfileData}`,
    `profile confidence: ${JSON.stringify(report.profiles.confidenceDistribution)}`,
    `light support: ${JSON.stringify(report.lightAnalysis.supportLevelDistribution)}`,
    `light confidence: ${JSON.stringify(report.lightAnalysis.confidenceDistribution)}`,
    `deep reasons: ${JSON.stringify(report.lightAnalysis.reasonDistribution)}`,
    `key reason rates: ${JSON.stringify(report.lightAnalysis.keyReasonRates)}`,
    `errors: ${report.errors}`,
    ...(report.samples ? [`samples: ${JSON.stringify(report.samples, null, 2)}`] : []),
  ].join('\n');
}

function emptyReport(options: SourcePipelineReportOptions): SourcePipelineReport {
  return {
    generatedAt: new Date().toISOString(), readOnly: true,
    filters: { status: options.status ?? null, from: options.from?.toISOString() ?? null, to: options.to?.toISOString() ?? null },
    articles: { total: 0, withArticleSource: 0, legacyOnly: 0, mixed: 0, withoutSources: 0 },
    articleSources: {
      totalRelations: 0, roleDistribution: {}, supportStrengthUnknown: { count: 0, percentage: 0 },
      topDomains: [], domainsWithoutDurableSource: { count: 0, domains: [] },
    },
    backfill: { articlesWithUnlinkedLegacySources: 0, articlesWithMergeCountDifference: 0, probablyPartialBackfill: 0 },
    extraction: { distribution: {}, articlesMostlyMetadataOnly: 0 },
    profiles: {
      totalSources: 0, confidenceDistribution: countRecord(CONFIDENCES), withoutProfileData: 0,
      withoutProfileSummary: 0, withoutSourceFacts: 0, withoutEditorialReputation: 0,
      withoutExternalReferences: 0, withClaimReferences: 0, sensitiveClaimsWithoutClaimReferences: 0,
    },
    lightAnalysis: {
      supportLevelDistribution: { strong: 0, nuanced: 0, fragile: 0, unverified: 0 },
      confidenceDistribution: { HIGH: 0, MEDIUM: 0, LOW: 0 },
      deepAnalysisRecommended: { count: 0, percentage: 0 }, reasonDistribution: {}, keyReasonRates: {}, reasonsSeparated: false,
    },
    ...(options.includeSamples ? { samples: {} } : {}), errors: 0,
  };
}

function articleWhere(options: SourcePipelineReportOptions): Record<string, unknown> {
  return {
    ...(options.status ? { status: options.status } : {}),
    ...(options.from || options.to ? { createdAt: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } } : {}),
  };
}

function articleSelect(): Record<string, unknown> {
  return {
    id: true, title: true, factCheckData: true, factCheckStatus: true, factCheckContentHash: true,
    articleSources: { select: {
      sourceId: true, sourceUrl: true, role: true, supportStrength: true, profileSnapshot: true,
      source: { select: { domain: true, type: true, profileData: true, profileConfidence: true, publicTrustLabel: true } },
    } },
  };
}

function readLegacySources(value: unknown): any[] {
  const sources = asRecord(value).sources;
  return Array.isArray(sources) ? sources.filter((source) => Object.keys(asRecord(source)).length > 0) : [];
}

function extractionState(source: any): typeof EXTRACTION_STATES[number] {
  const extraction = cleanText(source.extractionStatus)?.toLowerCase();
  const analysis = cleanText(source.analysisStatus)?.toUpperCase();
  if (extraction === 'metadata_only' || analysis === 'METADATA_ONLY') return 'METADATA_ONLY';
  if (extraction === 'failed' || analysis === 'UNAVAILABLE') return 'UNAVAILABLE';
  if (extraction === 'full' || analysis === 'ANALYZED') return 'FULL';
  return 'UNKNOWN';
}

function hasUnreferencedSensitiveClaims(profile: Record<string, unknown>): boolean {
  const reputation = asRecord(profile.editorialReputation);
  const claims = asRecord(profile.claimReferences);
  const sensitivePaths = [
    'editorialPositioning', 'generalReputation', 'reliabilitySignals',
    'misinformationSignals', 'correctionHistory', 'editorialPolicy',
  ];
  if (sensitivePaths.some((field) => hasValue(reputation[field]) && !hasNonEmptyArray(claims[`editorialReputation.${field}`]))) return true;
  const vigilance = Array.isArray(profile.vigilancePoints) ? profile.vigilancePoints.filter((item): item is string => typeof item === 'string') : [];
  return vigilance.some((item) => /(d[ée]sinformation|controvers|politi|partisan|propagand|accus|sanction|biais)/i.test(item))
    && !hasNonEmptyArray(claims.vigilancePoints);
}

function addSample(report: SourcePipelineReport, category: string, sample: Record<string, unknown>, options: SourcePipelineReportOptions): void {
  if (!options.includeSamples || !report.samples) return;
  const samples = report.samples[category] ??= [];
  if (samples.length < options.sampleLimit) samples.push(sample);
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}
function cleanText(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function hasNonEmptyArray(value: unknown): boolean { return Array.isArray(value) && value.length > 0; }
function hasValue(value: unknown): boolean { return Array.isArray(value) ? value.length > 0 : Boolean(cleanText(value)); }
function countRecord(values: readonly string[]): Record<string, number> { return Object.fromEntries(values.map((value) => [value, 0])); }
function sumRecord(value: Record<string, number>): number { return Object.values(value).reduce((sum, count) => sum + count, 0); }
function percentage(count: number, total: number): number { return total > 0 ? Math.round((count / total) * 10000) / 100 : 0; }
function rateRecord(counts: Record<string, number>, total: number): Record<string, { count: number; percentage: number }> {
  return Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, { count, percentage: percentage(count, total) }]));
}
function formatRates(rates: Record<string, { count: number; percentage: number }>): string {
  return Object.entries(rates).map(([key, value]) => `${key}=${value.count} (${value.percentage}%)`).join(', ');
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function assertKnownArguments(argv: string[]): void {
  const flags = new Set(['--json', '--include-samples']);
  const valued = new Set(['--limit', '--status', '--from', '--to']);
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
function readStringOption(argv: string[], name: string): string | undefined { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; }
function readPositiveIntegerOption(argv: string[], name: string): number | undefined {
  const raw = readStringOption(argv, name); if (raw === undefined) return undefined;
  const value = Number(raw); if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`); return value;
}
function readDateOption(argv: string[], name: string): Date | undefined {
  const raw = readStringOption(argv, name); if (!raw) return undefined;
  const date = new Date(raw); if (Number.isNaN(date.getTime())) throw new Error(`${name} must be a valid date.`); return date;
}

async function main(): Promise<void> {
  const options = parseSourcePipelineReportOptions(process.argv.slice(2));
  console.error('[READ-ONLY] Source pipeline report: database reads only; no network, AI, workers, or writes.');
  try {
    const report = await runSourcePipelineReport(prisma as SourcePipelineReportClient, options);
    console.log(formatSourcePipelineReport(report, options.json));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[ERROR] ${errorMessage(error)}`); process.exitCode = 1; });
}
