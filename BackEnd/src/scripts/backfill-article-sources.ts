import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import {
  buildArticleSourceProfileSnapshot,
  buildArticleSourceUpsertInput,
  hashArticleSourceUrl,
  normalizeArticleSourceUrl,
} from '../lib/article-source-service.js';

export interface BackfillOptions {
  mode: 'dry-run' | 'write';
  limit?: number;
  batchSize: number;
  cursor?: string;
}

export interface BackfillReport {
  articlesScanned: number;
  sourcesRead: number;
  relationsWouldCreate: number;
  relationsCreated: number;
  relationsUpdatedOrSkipped: number;
  duplicatesDetected: number;
  invalidUrls: number;
  domainsWithoutSource: number;
  articlesIgnored: number;
  errors: number;
  lastCursor: string | null;
  samples: Array<Record<string, unknown>>;
}

export interface BackfillReadClient {
  article: {
    findMany(args: any): Promise<Array<{ id: string; factCheckData: unknown }>>;
  };
  source: {
    findMany(args: any): Promise<Array<{ id: string; domain: string }>>;
  };
  articleSource: {
    findMany(args: any): Promise<Array<{ articleId: string; sourceUrlHash: string }>>;
  };
}

export interface BackfillWriteClient extends BackfillReadClient {
  $transaction<T>(callback: (tx: {
    articleSource: { upsert(args: Prisma.ArticleSourceUpsertArgs): Promise<unknown> };
  }) => Promise<T>): Promise<T>;
}

type Log = (message: string) => void;

export function parseBackfillOptions(argv: string[]): BackfillOptions {
  const dryRun = argv.includes('--dry-run');
  const write = argv.includes('--write');
  if (dryRun === write) {
    throw new Error('Choose exactly one explicit mode: --dry-run or --write.');
  }

  return {
    mode: write ? 'write' : 'dry-run',
    limit: readPositiveIntegerOption(argv, '--limit'),
    batchSize: readPositiveIntegerOption(argv, '--batch-size') ?? 100,
    cursor: readStringOption(argv, '--cursor'),
  };
}

export async function runArticleSourceBackfill(
  client: BackfillReadClient | BackfillWriteClient,
  options: BackfillOptions,
  log: Log = console.log,
): Promise<BackfillReport> {
  if (options.mode === 'write' && !isWriteClient(client)) {
    throw new Error('Write mode requires an explicit transactional write client.');
  }

  const report: BackfillReport = {
    articlesScanned: 0,
    sourcesRead: 0,
    relationsWouldCreate: 0,
    relationsCreated: 0,
    relationsUpdatedOrSkipped: 0,
    duplicatesDetected: 0,
    invalidUrls: 0,
    domainsWithoutSource: 0,
    articlesIgnored: 0,
    errors: 0,
    lastCursor: options.cursor ?? null,
    samples: [],
  };

  let cursor = options.cursor;

  while (options.limit === undefined || report.articlesScanned < options.limit) {
    const remaining = options.limit === undefined
      ? options.batchSize
      : Math.min(options.batchSize, options.limit - report.articlesScanned);
    if (remaining <= 0) break;

    let articles: Array<{ id: string; factCheckData: unknown }>;
    try {
      articles = await client.article.findMany({
        take: remaining,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        where: { factCheckData: { not: Prisma.DbNull } },
        orderBy: { id: 'asc' },
        select: { id: true, factCheckData: true },
      });
    } catch (error) {
      report.errors++;
      log(`[ERROR] Article batch read failed: ${errorMessage(error)}`);
      break;
    }

    if (articles.length === 0) break;
    report.articlesScanned += articles.length;
    const batchCursor = articles[articles.length - 1].id;

    const preparedByArticle = new Map<string, PreparedLegacySource[]>();
    const articlesWithLegacySources = new Set<string>();
    const domains = new Set<string>();

    for (const article of articles) {
      const legacySources = readLegacySources(article.factCheckData);
      if (legacySources.length === 0) {
        report.articlesIgnored++;
        continue;
      }
      articlesWithLegacySources.add(article.id);

      const prepared: PreparedLegacySource[] = [];
      for (const [position, source] of legacySources.entries()) {
        report.sourcesRead++;
        const normalizedUrl = normalizeArticleSourceUrl(source.url);
        const sourceUrlHash = normalizedUrl ? hashArticleSourceUrl(normalizedUrl) : null;
        if (!normalizedUrl || !sourceUrlHash) {
          report.invalidUrls++;
          continue;
        }

        const domain = domainFromUrl(normalizedUrl);
        if (!domain) {
          report.invalidUrls++;
          continue;
        }

        domains.add(domain);
        prepared.push({ source, position, normalizedUrl, sourceUrlHash, domain });
      }
      preparedByArticle.set(article.id, prepared);
    }

    let durableSources: Array<{ id: string; domain: string }>;
    let existingRelations: Array<{ articleId: string; sourceUrlHash: string }>;
    try {
      [durableSources, existingRelations] = await Promise.all([
        domains.size > 0
          ? client.source.findMany({
              where: { domain: { in: [...domains], mode: 'insensitive' } },
              select: { id: true, domain: true },
            })
          : Promise.resolve([]),
        client.articleSource.findMany({
          where: { articleId: { in: articles.map((article) => article.id) } },
          select: { articleId: true, sourceUrlHash: true },
        }),
      ]);
    } catch (error) {
      report.errors++;
      log(`[ERROR] Source lookup failed for batch ending at ${batchCursor}: ${errorMessage(error)}`);
      break;
    }

    const sourceByDomain = new Map(
      durableSources.map((source) => [normalizeDomain(source.domain), source]),
    );
    const seenRelationKeys = new Set(
      existingRelations.map((relation) => relationKey(relation.articleId, relation.sourceUrlHash)),
    );
    const pendingUpserts: Prisma.ArticleSourceUpsertArgs[] = [];

    for (const article of articles) {
      const prepared = preparedByArticle.get(article.id) ?? [];
      let simulatedForArticle = 0;

      for (const candidate of prepared) {
        const durableSource = sourceByDomain.get(candidate.domain);
        if (!durableSource) {
          report.domainsWithoutSource++;
          continue;
        }

        const key = relationKey(article.id, candidate.sourceUrlHash);
        if (seenRelationKeys.has(key)) {
          report.duplicatesDetected++;
          report.relationsUpdatedOrSkipped++;
          continue;
        }
        seenRelationKeys.add(key);

        const profileSnapshot = hasEmbeddedProfile(candidate.source)
          ? buildArticleSourceProfileSnapshot({
              profileData: candidate.source.profileData,
              profileConfidence: candidate.source.profileConfidence,
              publicTrustLabel: candidate.source.publicTrustLabel,
              lastProfiledAt: candidate.source.lastProfiledAt,
            })
          : null;
        const upsert = buildArticleSourceUpsertInput({
          articleId: article.id,
          durableSourceId: durableSource.id,
          sourceUrl: candidate.normalizedUrl,
          role: 'UNKNOWN',
          supportStrength: 'UNKNOWN',
          provenance: 'IMPORTED_LEGACY',
          profileSnapshot,
          profileVersion: integerOrNull(candidate.source.profileVersion),
          snapshotAt: profileSnapshot?.snapshotAt ?? null,
          position: candidate.position,
          preserveExistingSnapshot: true,
        });
        if (!upsert) {
          report.errors++;
          continue;
        }

        if (options.mode === 'dry-run') {
          report.relationsWouldCreate++;
        } else {
          pendingUpserts.push(upsert);
        }
        simulatedForArticle++;
        if (report.samples.length < 10) {
          report.samples.push(upsert.create as Record<string, unknown>);
        }
      }

      if (articlesWithLegacySources.has(article.id) && simulatedForArticle === 0) {
        report.articlesIgnored++;
      }
    }

    if (options.mode === 'write' && pendingUpserts.length > 0) {
      try {
        await writeArticleSourceChunks(
          client as BackfillWriteClient,
          pendingUpserts,
          (written) => { report.relationsCreated += written; },
        );
      } catch (error) {
        report.errors++;
        log(`[ERROR] ArticleSource write failed for batch ending at ${batchCursor}: ${errorMessage(error)}`);
        break;
      }
    }

    cursor = batchCursor;
    report.lastCursor = cursor;
    log(`[${options.mode === 'write' ? 'WRITE' : 'DRY-RUN'}] Batch complete: articles=${articles.length}, cursor=${cursor}`);
    if (articles.length < remaining) break;
  }

  return report;
}

export function formatBackfillReport(report: BackfillReport, mode: BackfillOptions['mode']): string {
  return [
    `ArticleSource backfill ${mode} report`,
    `articles scanned: ${report.articlesScanned}`,
    `sources read: ${report.sourcesRead}`,
    `relations that would be created: ${report.relationsWouldCreate}`,
    `relations created: ${report.relationsCreated}`,
    `relations updated/skipped: ${report.relationsUpdatedOrSkipped}`,
    `duplicates detected: ${report.duplicatesDetected}`,
    `invalid URLs: ${report.invalidUrls}`,
    `domains without Source: ${report.domainsWithoutSource}`,
    `articles ignored: ${report.articlesIgnored}`,
    `errors: ${report.errors}`,
    `last cursor: ${report.lastCursor ?? 'none'}`,
  ].join('\n');
}

async function writeArticleSourceChunks(
  client: BackfillWriteClient,
  upserts: Prisma.ArticleSourceUpsertArgs[],
  onChunkCommitted: (count: number) => void,
): Promise<void> {
  const transactionSize = 25;
  for (let index = 0; index < upserts.length; index += transactionSize) {
    const chunk = upserts.slice(index, index + transactionSize);
    await client.$transaction(async (tx) => {
      for (const upsert of chunk) await tx.articleSource.upsert(upsert);
    });
    onChunkCommitted(chunk.length);
  }
}

function isWriteClient(client: BackfillReadClient | BackfillWriteClient): client is BackfillWriteClient {
  return '$transaction' in client && typeof client.$transaction === 'function';
}

interface PreparedLegacySource {
  source: Record<string, any>;
  position: number;
  normalizedUrl: string;
  sourceUrlHash: string;
  domain: string;
}

function readLegacySources(factCheckData: unknown): Array<Record<string, any>> {
  if (!factCheckData || typeof factCheckData !== 'object' || Array.isArray(factCheckData)) return [];
  const sources = (factCheckData as Record<string, unknown>).sources;
  return Array.isArray(sources)
    ? sources.filter((source): source is Record<string, any> => Boolean(source && typeof source === 'object' && !Array.isArray(source)))
    : [];
}

function hasEmbeddedProfile(source: Record<string, any>): boolean {
  return source.profileData != null
    || source.profileConfidence != null
    || source.publicTrustLabel != null
    || source.lastProfiledAt != null;
}

function domainFromUrl(url: string): string | null {
  try {
    return normalizeDomain(new URL(url).hostname);
  } catch {
    return null;
  }
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, '');
}

function relationKey(articleId: string, sourceUrlHash: string): string {
  return `${articleId}\u0000${sourceUrlHash}`;
}

function integerOrNull(value: unknown): number | null {
  return Number.isInteger(value) ? value as number : null;
}

function readPositiveIntegerOption(argv: string[], name: string): number | undefined {
  const raw = readStringOption(argv, name);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function readStringOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const options = parseBackfillOptions(process.argv.slice(2));
  console.log(options.mode === 'dry-run'
    ? '[DRY-RUN] No database writes will be performed.'
    : '[WRITE] ArticleSource upserts are enabled. Article.factCheckData will not be modified.');
  try {
    const report = await runArticleSourceBackfill(prisma, options);
    console.log(formatBackfillReport(report, options.mode));
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
