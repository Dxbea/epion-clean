import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/epion_test';
process.env.OPENAI_API_KEY ??= 'test-openai-key';

const articleCreate = vi.fn();
const articleUpdate = vi.fn();
const articleFindFirst = vi.fn();
const articleFindUnique = vi.fn();
const userFindUnique = vi.fn();
const liveAnalysisAdd = vi.fn();
const runLiveAnalysisWithGeneration = vi.fn();

vi.mock('../src/lib/db.js', () => ({
  prisma: {
    article: {
      create: articleCreate,
      update: articleUpdate,
      findFirst: articleFindFirst,
      findUnique: articleFindUnique,
    },
    user: {
      findUnique: userFindUnique,
    },
  },
}));

vi.mock('../src/lib/currentUser.js', () => ({
  getCurrentUser: vi.fn(async () => ({ id: 'user-1' })),
  getCurrentUserId: vi.fn(async () => 'user-1'),
}));

vi.mock('../src/lib/queue.js', () => ({
  embeddingQueue: { add: vi.fn() },
  liveAnalysisQueue: { add: liveAnalysisAdd },
  sourceEnrichmentQueue: { add: vi.fn() },
}));

vi.mock('../src/lib/live-analysis/index.js', () => ({
  runLiveAnalysisWithGeneration,
}));

vi.mock('../src/lib/rateLimiter.js', () => ({
  checkAndIncrement: vi.fn(async () => undefined),
}));

vi.mock('../src/lib/billing-service.js', () => ({
  checkArticleQuota: vi.fn(async () => undefined),
  hasSufficientFunds: vi.fn(async () => true),
  chargeUser: vi.fn(async () => undefined),
  COSTS: { CHAT_FAST: 1 },
}));

vi.mock('../src/lib/rag-service.js', () => ({
  ingestArticle: vi.fn(async () => undefined),
}));

vi.mock('../src/services/bridgingService.js', () => ({
  recalculateBridgingScores: vi.fn(async () => undefined),
}));

vi.mock('../src/services/moderationService.js', () => ({
  moderationService: {},
}));

vi.mock('../src/lib/contribution-rate-limit.js', () => ({
  enforceContributionRateLimit: vi.fn(async () => undefined),
}));

vi.mock('../src/lib/images/proposals.js', () => ({
  getArticleImageProposals: vi.fn(async () => []),
}));

vi.mock('../src/services/articleGenerator.js', () => ({
  transformTextWithAI: vi.fn(async () => 'edited text'),
}));

vi.mock('../src/lib/structured-article.js', () => ({
  stableSourceId: vi.fn((url: string, index: number) => `source-${index}-${url}`),
}));

const { router } = await import('../src/routes/articles.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/articles', router);
  return app;
}

describe('async article generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindUnique.mockResolvedValue({ emailVerified: true, role: 'USER' });
    articleFindFirst.mockResolvedValue(null);
    articleCreate.mockResolvedValue({
      id: 'article-1',
      slug: 'generation-pending-article-1',
      factCheckStatus: 'PENDING',
      status: 'DRAFT',
    });
    articleUpdate.mockResolvedValue({ id: 'article-1', slug: 'generation-pending-article-1' });
    liveAnalysisAdd.mockResolvedValue({ id: 'job-1' });
    runLiveAnalysisWithGeneration.mockRejectedValue(new Error('synchronous generation should not run in the API request'));
  });

  it('creates a pending draft article and enqueues generation without running live analysis inline', async () => {
    const response = await request(buildApp())
      .post('/api/articles/generate')
      .send({
        topic: 'Elections europeennes et desinformation',
        language: 'fr',
        style: 'neutral',
        category: 'politics',
      });

    expect(response.status).toBe(201);
    expect(runLiveAnalysisWithGeneration).not.toHaveBeenCalled();
    expect(articleCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: 'Elections europeennes et desinformation',
        status: 'DRAFT',
        factCheckStatus: 'PENDING',
        generationPrompt: 'Elections europeennes et desinformation',
        generationConfig: expect.objectContaining({
          language: 'fr',
          style: 'neutral',
          category: 'politics',
        }),
      }),
    }));
    expect(liveAnalysisAdd).toHaveBeenCalledWith(
      'article-generation',
      expect.objectContaining({
        articleId: 'article-1',
        requestedByUserId: 'user-1',
        mode: 'article-generation',
        topic: 'Elections europeennes et desinformation',
        language: 'fr',
        style: 'neutral',
        category: 'politics',
        timeoutMs: expect.any(Number),
      }),
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }),
    );
    expect(response.body).toMatchObject({
      articleId: 'article-1',
      slug: 'generation-pending-article-1',
      generationStatus: 'PENDING',
      factCheckStatus: 'PENDING',
      article: { id: 'article-1', slug: 'generation-pending-article-1' },
    });
  });

  it('returns an existing pending generation within the idempotency window instead of enqueueing a duplicate', async () => {
    articleFindFirst.mockResolvedValueOnce({
      id: 'article-existing',
      slug: 'existing-pending',
      factCheckStatus: 'RUNNING',
    });

    const response = await request(buildApp())
      .post('/api/articles/generate')
      .send({ topic: 'Same topic', language: 'fr', style: 'neutral' });

    expect(response.status).toBe(200);
    expect(articleCreate).not.toHaveBeenCalled();
    expect(liveAnalysisAdd).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      articleId: 'article-existing',
      slug: 'existing-pending',
      generationStatus: 'RUNNING',
      factCheckStatus: 'RUNNING',
      idempotentReplay: true,
      article: { id: 'article-existing', slug: 'existing-pending' },
    });
  });


  it('rejects publishing a generated article while generation is still running', async () => {
    articleFindUnique.mockResolvedValueOnce({
      id: 'article-1',
      authorId: 'user-1',
      status: 'DRAFT',
      title: 'Pending article',
      summary: null,
      content: null,
      structuredContent: null,
      factCheckContentHash: null,
      factCheckStatus: 'RUNNING',
      generationPrompt: 'Pending topic',
    });

    const response = await request(buildApp())
      .put('/api/articles/article-1')
      .send({ status: 'PUBLISHED' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'article_content_required' });
    expect(articleUpdate).not.toHaveBeenCalled();
  });

  it('returns generation status for the article author', async () => {
    articleFindUnique.mockResolvedValueOnce({
      id: 'article-1',
      slug: 'generation-pending-article-1',
      status: 'DRAFT',
      authorId: 'user-1',
      factCheckStatus: 'RUNNING',
      factCheckError: null,
      factCheckStartedAt: new Date('2026-07-04T12:00:00.000Z'),
      factCheckCompletedAt: null,
      generationPrompt: 'Topic',
      content: null,
      updatedAt: new Date('2026-07-04T12:05:00.000Z'),
    });

    const response = await request(buildApp()).get('/api/articles/article-1/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 'article-1',
      articleId: 'article-1',
      slug: 'generation-pending-article-1',
      status: 'DRAFT',
      generationStatus: 'RUNNING',
      factCheckStatus: 'RUNNING',
      factCheckError: null,
      error: null,
      updatedAt: '2026-07-04T12:05:00.000Z',
      contentReady: false,
      startedAt: '2026-07-04T12:00:00.000Z',
      completedAt: null,
    });
  });
});


