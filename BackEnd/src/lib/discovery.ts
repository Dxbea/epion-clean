import { XMLParser } from 'fast-xml-parser';
import logger from './logger';
import axiosInstance from './http-client';
import { redis } from './redis';
const log = logger.child({ module: 'Discovery' });

function buildDiscoveryMeta(
  url?: string | null,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    url: url ?? null,
    ...extra,
  };
}

export interface DiscoveredArticle {
  url: string;
  title?: string;
  publishedAt?: string;
  source: 'sitemap' | 'gdelt';
  domain?: string;
  language?: string;
}

interface SitemapOptions {
  maxUrls?: number;
  maxDepth?: number;
}

interface GdeltArticle {
  url: string;
  title?: string;
  seendate?: string;
  domain?: string;
  language?: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

const SITEMAP_TIMEOUT_MS = 20_000;
const SITEMAP_MAX_RETRIES = 2;
const GDELT_DISCOVERY_COOLDOWN_MS = 15_000;
const GDELT_DISCOVERY_COOLDOWN_KEY = 'news:discovery:gdelt:cooldown';
const inMemoryDedupUrls = new Set<string>();
let memoryGdeltCooldownUntil = 0;

export const DEDUP_URLS_KEY = 'dedup:urls';

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function claimDiscoveredUrl(url: string): Promise<boolean> {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    return false;
  }

  try {
    const added = await redis.sadd(DEDUP_URLS_KEY, normalizedUrl);
    return added === 1;
  } catch (error: any) {
    log.warn('Redis SADD failed during discovery dedup, using memory fallback', buildDiscoveryMeta(normalizedUrl, {
      dedupKey: DEDUP_URLS_KEY,
      error: error.message,
    }));
  }

  if (inMemoryDedupUrls.has(normalizedUrl)) {
    return false;
  }

  inMemoryDedupUrls.add(normalizedUrl);
  return true;
}

async function waitForGdeltCooldown(): Promise<void> {
  while (true) {
    try {
      const nextAllowedAt = Date.now() + GDELT_DISCOVERY_COOLDOWN_MS;
      const lock = await redis.set(
        GDELT_DISCOVERY_COOLDOWN_KEY,
        nextAllowedAt.toString(),
        'PX',
        GDELT_DISCOVERY_COOLDOWN_MS,
        'NX',
      );

      if (lock === 'OK') {
        return;
      }

      const ttlMs = await redis.pttl(GDELT_DISCOVERY_COOLDOWN_KEY);
      const waitMs = ttlMs > 0 ? ttlMs : GDELT_DISCOVERY_COOLDOWN_MS;

      log.warn('GDELT discovery cooldown active, waiting before next request', buildDiscoveryMeta(
        'https://api.gdeltproject.org/api/v2/doc/doc',
        {
        waitMs,
        cooldownMs: GDELT_DISCOVERY_COOLDOWN_MS,
        },
      ));

      await sleep(waitMs);
      continue;
    } catch (error: any) {
      const waitMs = Math.max(0, memoryGdeltCooldownUntil - Date.now());
      if (waitMs > 0) {
        log.warn('GDELT discovery cooldown Redis unavailable, using memory fallback', buildDiscoveryMeta(
          'https://api.gdeltproject.org/api/v2/doc/doc',
          {
          waitMs,
          cooldownMs: GDELT_DISCOVERY_COOLDOWN_MS,
          error: error.message,
          },
        ));
        await sleep(waitMs);
      } else {
        log.warn('GDELT discovery cooldown Redis unavailable, proceeding with memory fallback', buildDiscoveryMeta(
          'https://api.gdeltproject.org/api/v2/doc/doc',
          {
          cooldownMs: GDELT_DISCOVERY_COOLDOWN_MS,
          error: error.message,
          },
        ));
      }

      memoryGdeltCooldownUntil = Date.now() + GDELT_DISCOVERY_COOLDOWN_MS;
      return;
    }
  }
}

export async function fetchSitemapUrls(
  sitemapUrl: string,
  options: SitemapOptions = {},
  depth = 0,
): Promise<DiscoveredArticle[]> {
  const maxUrls = options.maxUrls ?? 200;
  const maxDepth = options.maxDepth ?? 2;

  if (depth > maxDepth) {
    return [];
  }

  log.info('Starting sitemap fetch', buildDiscoveryMeta(sitemapUrl, {
    depth,
    maxUrls,
    maxDepth,
  }));

  let lastError: unknown;
  let response: { data: string };

  for (let attempt = 1; attempt <= SITEMAP_MAX_RETRIES; attempt++) {
    try {
      response = await axiosInstance.get<string>(sitemapUrl, {
        timeout: SITEMAP_TIMEOUT_MS,
        responseType: 'text',
        headers: {
          'User-Agent': 'EpionBot/1.0 (+https://epion.app)',
          Accept: 'application/xml,text/xml,application/xhtml+xml,text/html;q=0.9,*/*;q=0.8',
        },
      });
      break;
    } catch (error: any) {
      lastError = error;

      log.warn('Sitemap fetch attempt failed', buildDiscoveryMeta(sitemapUrl, {
        depth,
        attempt,
        maxAttempts: SITEMAP_MAX_RETRIES,
        status: error.response?.status,
        error: error.message,
      }));

      if (attempt === SITEMAP_MAX_RETRIES) {
        log.error('Sitemap fetch failed', buildDiscoveryMeta(sitemapUrl, {
          depth,
          status: error.response?.status,
          error: error.message,
        }));
        throw error;
      }
    }
  }

  if (!response!) {
    throw lastError instanceof Error ? lastError : new Error('Sitemap fetch failed');
  }

  const parsed = xmlParser.parse(response.data) as {
    urlset?: { url?: Array<{ loc?: string; lastmod?: string }> | { loc?: string; lastmod?: string } };
    sitemapindex?: { sitemap?: Array<{ loc?: string }> | { loc?: string } };
  };

  const directUrls = toArray(parsed.urlset?.url)
    .map((entry) => ({
      url: entry.loc || '',
      publishedAt: entry.lastmod,
      source: 'sitemap' as const,
    }))
    .filter((entry) => Boolean(entry.url));

  if (directUrls.length > 0) {
    log.info('Sitemap fetch success', buildDiscoveryMeta(sitemapUrl, {
      depth,
      found: directUrls.length,
      kind: 'urlset',
    }));
    return directUrls.slice(0, maxUrls);
  }

  const nestedSitemaps = toArray(parsed.sitemapindex?.sitemap)
    .map((entry) => entry.loc)
    .filter((value): value is string => Boolean(value));

  const nestedResults = await Promise.all(
    nestedSitemaps.slice(0, maxUrls).map((nestedUrl) => fetchSitemapUrls(nestedUrl, options, depth + 1)),
  );

  log.info('Sitemap fetch success', buildDiscoveryMeta(sitemapUrl, {
    depth,
    found: nestedResults.flat().length,
    kind: 'sitemapindex',
  }));

  return nestedResults.flat().slice(0, maxUrls);
}

export async function fetchGdeltArticleList(
  query = 'lang:French',
  maxRecords = 50,
): Promise<DiscoveredArticle[]> {
  const endpoint = 'https://api.gdeltproject.org/api/v2/doc/doc';

  await waitForGdeltCooldown();

  log.info('Starting GDELT article list fetch', buildDiscoveryMeta(endpoint, {
    query,
    maxRecords,
    cooldownMs: GDELT_DISCOVERY_COOLDOWN_MS,
  }));

  try {
    const response = await axiosInstance.get<{
      articles?: GdeltArticle[];
    }>(endpoint, {
      timeout: 15_000,
      headers: {
        'User-Agent': 'EpionBot/1.0 (+https://epion.app)',
        Accept: 'application/json',
      },
      params: {
        query,
        mode: 'ArtList',
        maxrecords: maxRecords,
        format: 'json',
        sort: 'DateDesc',
      },
    });

    const articles = (response.data.articles || [])
      .map((article) => ({
        url: article.url,
        title: article.title,
        publishedAt: article.seendate,
        domain: article.domain,
        language: article.language,
        source: 'gdelt' as const,
      }))
      .filter((article) => Boolean(article.url));

    log.info('GDELT discovery success', buildDiscoveryMeta(endpoint, {
      query,
      maxRecords,
      found: articles.length,
    }));

    return articles;
  } catch (error: any) {
    log.error('GDELT discovery failed', buildDiscoveryMeta(endpoint, {
      query,
      maxRecords,
      status: error.response?.status,
      error: error.message,
    }));
    throw error;
  }
}
