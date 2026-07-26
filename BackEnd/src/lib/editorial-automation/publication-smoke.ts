import type { PrismaClient } from '@prisma/client';
import { normalizePublicApiBaseUrl, type OperationalReadinessCheck } from './operational-readiness.js';

export interface EditorialPublicationSmokeReport {
  articleId: string;
  publicUrl: string | null;
  go: boolean;
  checks: OperationalReadinessCheck[];
}

export async function runEditorialPublicationSmoke(
  client: PrismaClient,
  input: {
    articleId: string;
    publicApiBaseUrl: string;
    fetcher?: typeof fetch;
  },
): Promise<EditorialPublicationSmokeReport> {
  const checks: OperationalReadinessCheck[] = [];
  const baseUrl = normalizePublicApiBaseUrl(input.publicApiBaseUrl);
  const publicUrl = baseUrl
    ? `${baseUrl}/api/articles/${encodeURIComponent(input.articleId)}`
    : null;
  if (!baseUrl || !publicUrl) {
    return {
      articleId: input.articleId,
      publicUrl,
      go: false,
      checks: [fail('PUBLIC_API_URL', 'A valid HTTPS public API base URL is required')],
    };
  }

  const article = await client.article.findUnique({
    where: { id: input.articleId },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      categoryId: true,
      content: true,
      structuredContent: true,
      factCheckScore: true,
      factCheckStatus: true,
      factCheckData: true,
      factCheckContentHash: true,
      articleSources: {
        select: {
          sourceUrl: true,
          source: { select: { domain: true } },
        },
      },
      editorialVerificationRuns: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, status: true },
      },
    },
  });
  if (!article) {
    return {
      articleId: input.articleId,
      publicUrl,
      go: false,
      checks: [fail('ARTICLE_EXISTS', 'Published Article was not found in PostgreSQL')],
    };
  }

  const databaseDomains = uniqueDomains(article.articleSources.map((source) =>
    source.source.domain ?? domainFromUrl(source.sourceUrl)));
  const factScore = jsonRecord(article.factCheckData);
  checks.push(article.status === 'PUBLISHED'
    ? pass('ARTICLE_STATUS', 'status=PUBLISHED')
    : fail('ARTICLE_STATUS', `status=${article.status}`));
  checks.push(article.publishedAt
    ? pass('ARTICLE_PUBLISHED_AT', article.publishedAt.toISOString())
    : fail('ARTICLE_PUBLISHED_AT', 'publishedAt is null'));
  checks.push(article.articleSources.length >= 2
    ? pass('ARTICLE_SOURCES', `${article.articleSources.length} ArticleSource records`)
    : fail('ARTICLE_SOURCES', `${article.articleSources.length} ArticleSource records; at least 2 required`));
  checks.push(databaseDomains.length >= 2
    ? pass('ARTICLE_SOURCE_DOMAINS', `${databaseDomains.length} independent domains`)
    : fail('ARTICLE_SOURCE_DOMAINS', `${databaseDomains.length} independent domains; at least 2 required`));
  checks.push(article.editorialVerificationRuns[0]?.status === 'PASSED'
    ? pass('VERIFICATION', `PASSED (${article.editorialVerificationRuns[0].id})`)
    : fail('VERIFICATION', `latest=${article.editorialVerificationRuns[0]?.status ?? '[missing]'}`));
  checks.push(
    article.factCheckStatus === 'COMPLETED'
    && typeof article.factCheckScore === 'number'
    && Boolean(article.factCheckContentHash)
    && factScore.status === 'COMPLETED'
    && factScore.score === article.factCheckScore
    && factScore.contentHash === article.factCheckContentHash
      ? pass('FACT_SCORE', `COMPLETED score=${article.factCheckScore}`)
      : fail('FACT_SCORE', 'FactScore contract is incomplete or inconsistent'),
  );
  checks.push(article.categoryId
    ? pass('CATEGORY', article.categoryId)
    : fail('CATEGORY', 'categoryId is missing'));
  checks.push(hasContent(article.content, article.structuredContent)
    ? pass('CONTENT', 'Article content is materialized')
    : fail('CONTENT', 'Article content is empty'));

  try {
    const response = await (input.fetcher ?? fetch)(publicUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'error',
    });
    checks.push(response.ok
      ? pass('PUBLIC_ENDPOINT_STATUS', `HTTP ${response.status}`)
      : fail('PUBLIC_ENDPOINT_STATUS', `HTTP ${response.status}`));
    if (response.ok) {
      const payload = await response.json() as Record<string, unknown>;
      const sources = Array.isArray(payload.sources)
        ? payload.sources.filter((source): source is Record<string, unknown> =>
            Boolean(source) && typeof source === 'object' && !Array.isArray(source))
        : [];
      const publicDomains = uniqueDomains(sources.map((source) =>
        typeof source.domain === 'string'
          ? source.domain
          : typeof source.url === 'string'
            ? domainFromUrl(source.url)
            : null));
      checks.push(
        payload.id === article.id
        && payload.status === 'PUBLISHED'
        && typeof payload.publishedAt === 'string'
          ? pass('PUBLIC_ARTICLE_STATE', 'Public payload is the published Article')
          : fail('PUBLIC_ARTICLE_STATE', 'Public payload does not expose the published Article state'),
      );
      checks.push(
        sources.length >= 2 && publicDomains.length >= 2
          ? pass('PUBLIC_ARTICLE_SOURCES', `${sources.length} sources across ${publicDomains.length} domains`)
          : fail('PUBLIC_ARTICLE_SOURCES', `${sources.length} sources across ${publicDomains.length} domains`),
      );
      checks.push(
        payload.category
        && typeof payload.factCheckScore === 'number'
        && hasContent(
          typeof payload.content === 'string' ? payload.content : null,
          payload.structuredContent,
        )
          ? pass('PUBLIC_ARTICLE_CONTENT', 'Category, FactScore and content are retrievable')
          : fail('PUBLIC_ARTICLE_CONTENT', 'Category, FactScore or content is missing from the public payload'),
      );
    }
  } catch (error) {
    checks.push(fail('PUBLIC_ENDPOINT_REQUEST', message(error)));
  }

  return {
    articleId: article.id,
    publicUrl,
    checks,
    go: checks.every((check) => check.level !== 'FAIL'),
  };
}

function uniqueDomains(values: Array<string | null>): string[] {
  return [...new Set(values.map((value) => value?.trim().toLowerCase()).filter((value): value is string =>
    Boolean(value)))].sort();
}

function domainFromUrl(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function hasContent(content: string | null, structuredContent: unknown): boolean {
  return Boolean(content?.trim())
    || Boolean(structuredContent && typeof structuredContent === 'object');
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function pass(code: string, detail: string): OperationalReadinessCheck {
  return { code, level: 'PASS', detail };
}
function fail(code: string, detail: string): OperationalReadinessCheck {
  return { code, level: 'FAIL', detail };
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
