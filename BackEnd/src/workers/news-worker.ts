import { DelayedError, Worker, type Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { ArticleStatus, type Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import logger from '../lib/logger.js';
import { newsIngestionQueue, embeddingQueue } from '../lib/queue.js';
import { extractArticle, DomainCircuitOpenError, isOperationalExtractionError } from '../lib/extractor.js';
import { claimDiscoveredUrl, DEDUP_URLS_KEY, fetchGdeltArticleList, fetchSitemapUrls, type DiscoveredArticle } from '../lib/discovery.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const log = logger.child({ module: 'NewsWorker' });

// ─── Inter-job delay for GDELT articles to avoid 429 bans ───────────────────
const GDELT_INTER_JOB_DELAY_MS = 2_000;

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
  job: Job<DiscoverSitemapJob | DiscoverGdeltJob | IngestUrlJob>,
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

/**
 * Enqueues discovered articles for individual ingestion.
 * GDELT-sourced articles get a staggered delay (2s per job) to prevent 429 bans
 * when the worker later fetches their content via extractor.ts.
 */
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

/**
 * Ingests a single URL: extract full content via extractor.ts, save to DB, chain to embedding.
 * No empty DRAFTs — if extraction fails, the job fails and BullMQ retries.
 */
async function ingestUrl(job: Job<DiscoverSitemapJob | DiscoverGdeltJob | IngestUrlJob>, data: IngestUrlJob): Promise<void> {
  const startMs = Date.now();

  log.info('Extraction requested by ingestion worker', buildWorkerMeta(job.id, data.url, {
    source: data.source,
  }));

  // ALL articles must go through extractor.ts — no bypass
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

  // ─── Chain to Embedding Queue for RAG indexing ──────────────────────────────
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
    // Non-fatal: article is saved, embedding can be retried later
    log.warn('Embedding enqueue failed', buildWorkerMeta(job.id, data.url, {
      articleId: article.id,
      error: embeddingError.message,
    }));
  }
}

// ─── Worker Instance ──────────────────────────────────────────────────────────
// concurrency: 1 — sequential processing to protect local RAM
// (jsdom + Readability can use 50-100MB per DOM parse)
export const newsWorker = new Worker(
  'news-ingestion-queue',
  async (job: Job<DiscoverSitemapJob | DiscoverGdeltJob | IngestUrlJob>) => {
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
    concurrency: 1, // Sequential: protect RAM from concurrent jsdom/Readability parses
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
  concurrency: 1,
  gdeltDelay: `${GDELT_INTER_JOB_DELAY_MS}ms`,
}));
