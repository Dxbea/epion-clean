import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getArticleGenerationStatus,
  isArticleGenerationInProgress,
  isArticleGenerationTerminal,
} from './articles';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('article generation API helpers', () => {
  it('fetches article generation status from the backend status endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          articleId: 'article-1',
          slug: 'pending-slug',
          status: 'DRAFT',
          generationStatus: 'RUNNING',
          factCheckStatus: 'RUNNING',
          error: null,
          startedAt: '2026-07-04T12:00:00.000Z',
          completedAt: null,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await expect(getArticleGenerationStatus('article-1')).resolves.toMatchObject({
      articleId: 'article-1',
      generationStatus: 'RUNNING',
      factCheckStatus: 'RUNNING',
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/articles/article-1/status'),
      { credentials: 'include' },
    );
  });

  it('classifies generation lifecycle states', () => {
    expect(isArticleGenerationInProgress('PENDING')).toBe(true);
    expect(isArticleGenerationInProgress('RUNNING')).toBe(true);
    expect(isArticleGenerationInProgress('COMPLETED')).toBe(false);
    expect(isArticleGenerationInProgress('FAILED')).toBe(false);

    expect(isArticleGenerationTerminal('COMPLETED')).toBe(true);
    expect(isArticleGenerationTerminal('FAILED')).toBe(true);
    expect(isArticleGenerationTerminal('RUNNING')).toBe(false);
  });
});
