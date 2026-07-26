import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { runEditorialPublicationSmoke } from '../src/lib/editorial-automation/publication-smoke.js';

const factHash = 'f'.repeat(64);

function client(overrides: Record<string, unknown> = {}) {
  const article = {
    id: 'article-1',
    status: 'PUBLISHED',
    publishedAt: new Date('2026-07-26T08:00:00.000Z'),
    categoryId: 'category-1',
    content: '<p>Published content</p>',
    structuredContent: { blocks: [] },
    factCheckScore: 91,
    factCheckStatus: 'COMPLETED',
    factCheckData: { status: 'COMPLETED', score: 91, contentHash: factHash },
    factCheckContentHash: factHash,
    articleSources: [
      { sourceUrl: 'https://a.example/article', source: { domain: 'a.example' } },
      { sourceUrl: 'https://b.example/article', source: { domain: 'b.example' } },
    ],
    editorialVerificationRuns: [{ id: 'verification-1', status: 'PASSED' }],
    ...overrides,
  };
  return {
    article: { findUnique: vi.fn(async () => article) },
  } as unknown as PrismaClient;
}

function publicResponse(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    id: 'article-1',
    status: 'PUBLISHED',
    publishedAt: '2026-07-26T08:00:00.000Z',
    category: { id: 'category-1' },
    factCheckScore: 91,
    content: '<p>Published content</p>',
    sources: [
      { url: 'https://a.example/article', domain: 'a.example' },
      { url: 'https://b.example/article', domain: 'b.example' },
    ],
    ...overrides,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('editorial public publication smoke', () => {
  it('validates both the durable publication gates and the anonymous public payload', async () => {
    const fetcher = vi.fn(async () => publicResponse());

    const report = await runEditorialPublicationSmoke(client(), {
      articleId: 'article-1',
      publicApiBaseUrl: 'https://epion.app',
      fetcher,
    });

    expect(report.go).toBe(true);
    expect(report.publicUrl).toBe('https://epion.app/api/articles/article-1');
    expect(fetcher).toHaveBeenCalledWith(
      'https://epion.app/api/articles/article-1',
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ARTICLE_SOURCE_DOMAINS', level: 'PASS' }),
      expect.objectContaining({ code: 'VERIFICATION', level: 'PASS' }),
      expect.objectContaining({ code: 'FACT_SCORE', level: 'PASS' }),
      expect.objectContaining({ code: 'PUBLIC_ARTICLE_CONTENT', level: 'PASS' }),
    ]));
  });

  it('fails when the public endpoint hides sources even if the database Article is valid', async () => {
    const report = await runEditorialPublicationSmoke(client(), {
      articleId: 'article-1',
      publicApiBaseUrl: 'https://epion.app',
      fetcher: vi.fn(async () => publicResponse({ sources: [] })),
    });

    expect(report.go).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({
      code: 'PUBLIC_ARTICLE_SOURCES',
      level: 'FAIL',
    }));
  });
});
