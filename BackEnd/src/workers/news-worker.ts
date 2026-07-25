import { fileURLToPath } from 'node:url';
import { DelayedError, Worker, type Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { ArticleStatus, type Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import logger from '../lib/logger.js';
import { documentCorpusQueue, newsIngestionQueue, embeddingQueue } from '../lib/queue.js';
import { extractArticle, DomainCircuitOpenError, isOperationalExtractionError } from '../lib/extractor.js';
import { claimDiscoveredUrl, DEDUP_URLS_KEY, fetchGdeltArticleList, fetchSitemapUrls, type DiscoveredArticle } from '../lib/discovery.js';
import type { WebEvidenceProvider } from '../lib/article-generation-core/evidence-gathering.js';
import { prepareEvidenceCorpus } from '../lib/article-generation-core/evidence-corpus.js';

const log = logger.child({ module: 'NewsWorker' });
const GDELT_INTER_JOB_DELAY_MS = 2_000;
const NEWS_WORKER_CONCURRENCY = 1;

export function legacyNewsDirectArticleEnabled(
  values: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = values.LEGACY_NEWS_DIRECT_ARTICLE_ENABLED;
  if (value === undefined || value === '') return true;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('LEGACY_NEWS_DIRECT_ARTICLE_ENABLED must be "true" or "false"');
}

type DiscoverSitemapJob = {
  sitemapUrl: string;
  maxUrls?: number;
};

type DiscoverGdeltJob = {
  query?: string;
  maxRecords?: number;
};

type IngestUrlJob = {
  url: string;
  title?: string;
  publishedAt?: string;
  source?: 'sitemap' | 'gdelt' | 'manual';
};

type NewsWorkerJobData = DiscoverSitemapJob | DiscoverGdeltJob | IngestUrlJob;

function createWorkerConnection(): IORedis {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  return new IORedis(redisUrl, { maxRetriesPerRequest: null });
}

function buildWorkerMeta(
  jobId?: string,
  url?: string | null,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    jobId: jobId ?? null,
    url: url ?? null,
    ...extra,
  };
}

async function recycleCircuitOpenJob(
  job: Job<NewsWorkerJobData>,
  data: IngestUrlJob,
  error: DomainCircuitOpenError,
): Promise<never> {
  const rescheduleAt = Math.max(error.openUntil, Date.now() + 1_000);
  const delayMs = Math.max(0, rescheduleAt - Date.now());

  log.warn('Rescheduling URL because circuit breaker is open', {
    ...buildWorkerMeta(job.id, data.url, {
      hostname: error.hostname,
      delayMs,
      rescheduleAt: new Date(rescheduleAt).toISOString(),
    }),
  });

  await job.moveToDelayed(rescheduleAt, job.token);
  throw new DelayedError(error.message);
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 64);
}

async function buildUniqueSlug(title: string): Promise<string> {
  const maxLen = 64;
  const base = slugify(title) || 'article';
  let slug = base;
  let suffix = 1;

  while (true) {
    const existing = await prisma.article.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing) {
      return slug;
    }

    const suffixValue = `-${suffix++}`;
    slug = `${base.slice(0, Math.max(1, maxLen - suffixValue.length))}${suffixValue}`;
  }
}

function buildSummary(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 280);
}

async function persistLegacyNewsEvidence(
  job: Job<NewsWorkerJobData>,
  data: IngestUrlJob,
): Promise<string | null> {
  const provider: WebEvidenceProvider = data.source === 'gdelt'
    ? 'GDELT'
    : data.source === 'sitemap'
      ? 'SITEMAP'
      : 'MANUAL';

  try {
    const result = await prepareEvidenceCorpus({
      client: prisma,
      documentQueue: documentCorpusQueue,
    }, {
      request: {
        mode: 'AUTO_EDITORIAL',
        topic: data.title || data.url,
        policy: { latency: { corpusWaitMs: 0 } },
      },
      persistence: {
        provider,
        maxCandidates: 1,
        candidates: [{
          url: data.url,
          title: data.title,
          publishedAt: data.publishedAt,
          metadata: {
            legacyNewsBridge: true,
            legacyDiscoverySource: data.source ?? 'manual',
          },
        }],
      },
    });
    const documentId = result.persistence.persisted[0]?.documentId ?? null;

    log.info('Legacy news discovery persisted in the document corpus', buildWorkerMeta(job.id, data.url, {
      provider,
      documentId,
      queuedForCorpus: result.queuedForCorpus,
      traceability: result.dossier.traceability,
    }));
    return documentId;
  } catch (error) {
    log.warn('Could not persist legacy news discovery; compatibility ingestion will continue', buildWorkerMeta(
      job.id,
      data.url,
      {
        provider,
        error: error instanceof Error ? error.message : String(error),
      },
    ));
    return null;
  }
}

async function enqueueDiscoveredArticles(
  articles: DiscoveredArticle[],
  discoveryJobId?: string,
): Promise<void> {
  let gdeltIndex = 0;
  let enqueuedCount = 0;
  let dedupSkipped = 0;

  for (const article of articles) {
    const claimed = await claimDiscoveredUrl(article.url);
    if (!claimed) {
      dedupSkipped++;
      log.info('Skipping already deduplicated URL before enqueue', {
        ...buildWorkerMeta(discoveryJobId, article.url, {
          source: article.source,
          dedupKey: DEDUP_URLS_KEY,
        }),
      });
      continue;
    }

    const isGdelt = article.source === 'gdelt';
    const delay = isGdelt ? GDELT_INTER_JOB_DELAY_MS * gdeltIndex : 0;

    const queuedJob = await newsIngestionQueue.add(
      'ingest-url',
      {
        url: article.url,
        title: article.title,
        publishedAt: article.publishedAt,
        source: article.source,
      } satisfies IngestUrlJob,
      {
        removeOnComplete: true,
        removeOnFail: 50,
        ...(delay > 0 ? { delay } : {}),
      },
    );

    log.info('URL enqueued for ingestion', buildWorkerMeta(queuedJob.id, article.url, {
      parentJobId: discoveryJobId ?? null,
      source: article.source,
    }));

    if (isGdelt) {
      gdeltIndex++;
    }

    enqueuedCount++;
  }

  log.info('Enqueued discovered articles for ingestion', {
    ...buildWorkerMeta(discoveryJobId, null, {
      discovered: articles.length,
      enqueued: enqueuedCount,
      dedupSkipped,
      gdeltCount: gdeltIndex,
      totalGdeltDelay: `${(GDELT_INTER_JOB_DELAY_MS * gdeltIndex) / 1000}s`,
    }),
  });
}

async function ingestUrl(job: Job<NewsWorkerJobData>, data: IngestUrlJob): Promise<void> {
  const startMs = Date.now();

  log.info('Extraction requested by ingestion worker', buildWorkerMeta(job.id, data.url, {
    source: data.source,
  }));

  const ingestedDocumentId = await persistLegacyNewsEvidence(job, data);
  if (!legacyNewsDirectArticleEnabled()) {
    if (!ingestedDocumentId) {
      throw new Error('Legacy direct Article creation is disabled and corpus persistence failed');
    }
    log.info('Legacy direct Article creation skipped after corpus handoff', buildWorkerMeta(
      job.id,
      data.url,
      { ingestedDocumentId },
    ));
    return;
  }
  const extracted = await extractArticle(data.url, { jobId: job.id });
  const title = extracted.title || data.title || new URL(data.url).hostname;
  const slug = await buildUniqueSlug(title);

  const generationConfig = {
    sourceUrl: data.url,
    discoverySource: data.source || 'manual',
    originalTitle: data.title || null,
    publishedAt: data.publishedAt || null,
    extractedAuthor: extracted.author || null,
    extractedSiteName: extracted.siteName || null,
    ingestedDocumentId,
  } satisfies Record<string, string | null>;

  const article = await prisma.article.create({
    data: {
      slug,
      title,
      summary: buildSummary(extracted.content),
      content: extracted.content,
      status: ArticleStatus.DRAFT,
      generationPrompt: `Imported from ${data.url}`,
      generationConfig: generationConfig as Prisma.InputJsonValue,
      generatedAt: new Date(),
    },
  });

  const elapsedMs = Date.now() - startMs;

  log.info('Draft article created from ingestion worker', buildWorkerMeta(job.id, data.url, {
    slug,
    source: data.source,
    contentLength: extracted.content.length,
    elapsedMs,
  }));

  try {
    await embeddingQueue.add('embed-ingested', {
      articleId: article.id,
      content: extracted.content,
    }, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    log.info('Job sent to embedding', buildWorkerMeta(job.id, data.url, {
      articleId: article.id,
      slug,
    }));
  } catch (embeddingError: any) {
    log.warn('Embedding enqueue failed', buildWorkerMeta(job.id, data.url, {
      articleId: article.id,
      error: embeddingError.message,
    }));
  }
}

/**
 * Worker: news-ingestion-queue
 * Discovers news URLs, ingests extracted content, and chains to embeddings.
 */
export function startNewsWorker(): Worker<NewsWorkerJobData> {
  const connection = createWorkerConnection();
  const newsWorker = new Worker(
    'news-ingestion-queue',
    async (job: Job<NewsWorkerJobData>) => {
      if (job.name === 'discover-sitemap') {
        const data = job.data as DiscoverSitemapJob;
        log.info('Discovery started from sitemap', buildWorkerMeta(job.id, data.sitemapUrl, {
          maxUrls: data.maxUrls,
        }));
        const discovered = await fetchSitemapUrls(data.sitemapUrl, {
          maxUrls: data.maxUrls,
        });
        log.info('Sitemap discovery completed', buildWorkerMeta(job.id, data.sitemapUrl, {
          discoveredCount: discovered.length,
        }));
        await enqueueDiscoveredArticles(discovered, job.id);
        return;
      }

      if (job.name === 'discover-gdelt') {
        const data = job.data as DiscoverGdeltJob;
        log.info('Discovery started from GDELT', buildWorkerMeta(job.id, 'https://api.gdeltproject.org/api/v2/doc/doc', {
          query: data.query,
          maxRecords: data.maxRecords,
        }));
        const discovered = await fetchGdeltArticleList(data.query, data.maxRecords);
        log.info('GDELT discovery completed', buildWorkerMeta(job.id, 'https://api.gdeltproject.org/api/v2/doc/doc', {
          query: data.query,
          discoveredCount: discovered.length,
        }));
        await enqueueDiscoveredArticles(discovered, job.id);
        return;
      }

      if (job.name === 'ingest-url') {
        const data = job.data as IngestUrlJob;
        try {
          await ingestUrl(job, data);
        } catch (error) {
          if (error instanceof DomainCircuitOpenError) {
            await recycleCircuitOpenJob(job, data, error);
          }

          throw error;
        }
      }
    },
    {
      connection: connection as any,
      concurrency: NEWS_WORKER_CONCURRENCY,
    },
  );

  newsWorker.on('completed', (job) => {
    log.debug('News worker job completed', {
      ...buildWorkerMeta(job?.id, (job?.data as IngestUrlJob | undefined)?.url ?? null, {
        name: job?.name,
      }),
    });
  });

  newsWorker.on('failed', (job, error) => {
    const meta = buildWorkerMeta(job?.id, (job?.data as IngestUrlJob | undefined)?.url ?? null, {
      name: job?.name,
      error: error.message,
    });

    if (isOperationalExtractionError(error)) {
      log.warn('News worker job failed with operational error', meta);
    } else {
      log.error('News worker job failed unexpectedly', meta);
    }
  });

  log.info('News ingestion worker started', buildWorkerMeta(undefined, null, {
    concurrency: NEWS_WORKER_CONCURRENCY,
    gdeltDelay: `${GDELT_INTER_JOB_DELAY_MS}ms`,
  }));

  return newsWorker;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startNewsWorker();
}
