import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/epion_test';
process.env.OPENAI_API_KEY ??= 'test-openai-key';

const articleFindUnique = vi.fn();
const articleFindFirst = vi.fn();
const sourceFindMany = vi.fn();

vi.mock('../src/lib/db.js', () => ({
  prisma: {
    article: {
      findUnique: articleFindUnique,
      findFirst: articleFindFirst,
    },
    source: {
      findMany: sourceFindMany,
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../src/lib/currentUser.js', () => ({
  getCurrentUser: vi.fn(async () => null),
  getCurrentUserId: vi.fn(async () => null),
}));

vi.mock('../src/lib/queue.js', () => ({
  embeddingQueue: { add: vi.fn() },
}));

vi.mock('../src/lib/rateLimiter.js', () => ({
  checkAndIncrement: vi.fn(async () => undefined),
}));

vi.mock('../src/lib/billing-service.js', () => ({
  checkArticleQuota: vi.fn(async () => undefined),
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

const { router } = await import('../src/routes/articles.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/articles', router);
  return app;
}

function publishedArticle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'article-id',
    slug: 'article-slug',
    title: 'Article',
    summary: 'Summary',
    content: 'Body [1]',
    structuredContent: { claims: [{ id: 'claim-1', sourceIds: ['src_1'] }] },
    imageUrl: null,
    status: 'PUBLISHED',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    authorId: 'author-id',
    category: null,
    author: { id: 'author-id', name: 'Ada', username: 'ada', avatarUrl: null },
    aiSummary: 'AI summary',
    factCheckScore: 82,
    factCheckStatus: 'COMPLETED',
    factCheckData: {
      version: 1,
      status: 'COMPLETED',
      score: 82,
      supportLevel: 'strong',
      calculation: {
        formula: 'weighted-source-live-v1',
        sourceWeight: 0.75,
        contentWeight: 0.25,
        sourcesMean: 88,
        contentScore: 64,
        finalScore: 82,
      },
      analyzedAt: '2026-01-01T00:00:00.000Z',
      contentHash: 'hash',
      sources: [
        {
          id: 1,
          sourceId: 'src_1',
          domain: 'example.com',
          url: 'https://example.com/story',
          trustScore: 88,
        },
      ],
      liveAnalysis: null,
    },
    generationPrompt: 'prompt',
    ...overrides,
  };
}

describe('article detail fact-check payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sourceFindMany.mockResolvedValue([]);
  });

  it('keeps an already rich source snapshot instead of overwriting it', async () => {
    articleFindUnique.mockResolvedValueOnce(publishedArticle({
      factCheckData: {
        ...publishedArticle().factCheckData,
        sources: [{
          domain: 'example.com',
          url: 'https://example.com/story',
          trustScore: 88,
          profileData: { description: 'Snapshot', type: 'Média' },
          profileConfidence: 'HIGH',
          publicTrustLabel: 'very_strong',
        }],
      },
    }));
    sourceFindMany.mockResolvedValueOnce([{
      domain: 'example.com',
      profileData: { description: 'Durable', type: 'MEDIA' },
      profileVersion: 1,
      profileConfidence: 'LOW',
      lastProfiledAt: new Date('2026-02-01T00:00:00.000Z'),
      publicTrustLabel: 'fragile',
    }]);

    const response = await request(buildApp()).get('/api/articles/article-id');

    expect(response.body.sources[0]).toMatchObject({
      profileData: { description: 'Snapshot' },
      profileConfidence: 'HIGH',
      publicTrustLabel: 'very_strong',
    });
  });

  it('hydrates a poor article snapshot from the durable Source profile', async () => {
    articleFindUnique.mockResolvedValueOnce(publishedArticle());
    sourceFindMany.mockResolvedValueOnce([{
      domain: 'example.com',
      profileData: { description: 'Profil durable', type: 'MEDIA' },
      profileVersion: 1,
      profileConfidence: 'MEDIUM',
      lastProfiledAt: new Date('2026-02-01T00:00:00.000Z'),
      publicTrustLabel: 'strong',
    }]);

    const response = await request(buildApp()).get('/api/articles/article-id');

    expect(response.body.sources[0]).toMatchObject({
      profileData: { description: 'Profil durable', type: 'Média' },
      profileVersion: 1,
      profileConfidence: 'MEDIUM',
      publicTrustLabel: 'strong',
    });
    expect(response.body.factCheckData.sources[0].profileData.description).toBe('Profil durable');
  });

  it('keeps a legacy article source unchanged when no durable Source exists', async () => {
    articleFindUnique.mockResolvedValueOnce(publishedArticle());

    const response = await request(buildApp()).get('/api/articles/article-id');

    expect(response.body.sources[0]).not.toHaveProperty('profileData');
    expect(response.body.sources[0]).not.toHaveProperty('publicTrustLabel');
  });

  it('looks up all unique article source domains in one grouped query', async () => {
    articleFindUnique.mockResolvedValueOnce(publishedArticle({
      factCheckData: {
        ...publishedArticle().factCheckData,
        sources: [
          { domain: 'www.example.com', url: 'https://example.com/a' },
          { domain: 'EXAMPLE.com', url: 'https://example.com/b' },
          { domain: 'other.test', url: 'https://other.test/c' },
        ],
      },
    }));

    await request(buildApp()).get('/api/articles/article-id');

    expect(sourceFindMany).toHaveBeenCalledTimes(1);
    expect(sourceFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { domain: { in: ['example.com', 'other.test'], mode: 'insensitive' } },
    }));
  });

  it('returns normalized fact-check fields and array sources from GET /api/articles/:id', async () => {
    articleFindUnique.mockResolvedValueOnce(publishedArticle());

    const response = await request(buildApp()).get('/api/articles/article-id');

    expect(response.status).toBe(200);
    expect(response.body.factCheckScore).toBe(82);
    expect(response.body.factCheckStatus).toBe('COMPLETED');
    expect(response.body.factCheckData).toMatchObject({ version: 1, score: 82, status: 'COMPLETED' });
    expect(response.body.aiSummary).toBe('AI summary');
    expect(response.body.generationPrompt).toBe('prompt');
    expect(Array.isArray(response.body.sources)).toBe(true);
    expect(response.body.sources).toHaveLength(1);
    expect(response.body.sources[0]).toMatchObject({ sourceId: 'src_1', domain: 'example.com', analysisStatus: 'ANALYZED' });
  });

  it('returns normalized fact-check fields and array sources from GET /api/articles/slug/:slug', async () => {
    articleFindUnique.mockResolvedValueOnce(publishedArticle());

    const response = await request(buildApp()).get('/api/articles/slug/article-slug');

    expect(response.status).toBe(200);
    expect(response.body.factCheckScore).toBe(82);
    expect(response.body.factCheckStatus).toBe('COMPLETED');
    expect(response.body.factCheckData).toMatchObject({ version: 1, score: 82, status: 'COMPLETED' });
    expect(Array.isArray(response.body.sources)).toBe(true);
    expect(response.body.sources).toHaveLength(1);
    expect(response.body.sources[0]).toMatchObject({ sourceId: 'src_1', domain: 'example.com' });
  });
  it('keeps draft articles hidden from anonymous callers on GET /api/articles/:id', async () => {
    articleFindUnique.mockResolvedValueOnce(publishedArticle({ status: 'DRAFT' }));

    const response = await request(buildApp()).get('/api/articles/article-id');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found' });
  });

  it('returns analysisStatus PENDING when article factCheckStatus is PENDING', async () => {
    articleFindUnique.mockResolvedValueOnce(publishedArticle({
      factCheckStatus: 'PENDING',
      factCheckData: {
        version: 1,
        status: 'PENDING',
        score: 0,
        supportLevel: 'unverified',
        calculation: { formula: 'weighted-source-live-v1', sourceWeight: 0.75, contentWeight: 0.25, sourcesMean: null, contentScore: 0, finalScore: 0 },
        analyzedAt: '2026-01-01T00:00:00.000Z',
        contentHash: 'hash',
        sources: [{ id: 1, sourceId: 'src_1', domain: 'example.com', url: 'https://example.com/story', trustScore: null, type: 'PENDING' }],
        liveAnalysis: null,
      },
    }));

    const response = await request(buildApp()).get('/api/articles/article-id');

    expect(response.status).toBe(200);
    expect(response.body.sources[0].analysisStatus).toBe('PENDING');
  });

  it('returns analysisStatus UNAVAILABLE for legacy ambiguous sources on COMPLETED articles', async () => {
    articleFindUnique.mockResolvedValueOnce(publishedArticle({
      factCheckStatus: 'COMPLETED',
      factCheckData: {
        version: 1,
        status: 'COMPLETED',
        score: 60,
        supportLevel: 'nuanced',
        calculation: { formula: 'weighted-source-live-v1', sourceWeight: 0.75, contentWeight: 0.25, sourcesMean: null, contentScore: 60, finalScore: 60 },
        analyzedAt: '2026-01-01T00:00:00.000Z',
        contentHash: 'hash',
        sources: [{ id: 1, sourceId: 'src_1', domain: 'example.com', url: 'https://example.com/story', trustScore: null, type: 'PENDING' }],
        liveAnalysis: null,
      },
    }));

    const response = await request(buildApp()).get('/api/articles/article-id');

    expect(response.status).toBe(200);
    expect(response.body.sources[0].analysisStatus).toBe('UNAVAILABLE');
  });

  it('returns analysisStatus METADATA_ONLY for sources with extractionStatus metadata_only', async () => {
    articleFindUnique.mockResolvedValueOnce(publishedArticle({
      factCheckStatus: 'COMPLETED',
      factCheckData: {
        version: 1,
        status: 'COMPLETED',
        score: 75,
        supportLevel: 'strong',
        calculation: { formula: 'weighted-source-live-v1', sourceWeight: 0.75, contentWeight: 0.25, sourcesMean: 75, contentScore: 75, finalScore: 75 },
        analyzedAt: '2026-01-01T00:00:00.000Z',
        contentHash: 'hash',
        sources: [{ id: 1, sourceId: 'src_1', domain: 'example.com', url: 'https://example.com/story', trustScore: 75, type: 'news', extractionStatus: 'metadata_only' }],
        liveAnalysis: null,
      },
    }));

    const response = await request(buildApp()).get('/api/articles/article-id');

    expect(response.status).toBe(200);
    expect(response.body.sources[0].analysisStatus).toBe('METADATA_ONLY');
  });

  it('returns analysisStatus UNAVAILABLE for sources with extractionStatus failed', async () => {
    articleFindUnique.mockResolvedValueOnce(publishedArticle({
      factCheckStatus: 'COMPLETED',
      factCheckData: {
        version: 1,
        status: 'COMPLETED',
        score: 50,
        supportLevel: 'nuanced',
        calculation: { formula: 'weighted-source-live-v1', sourceWeight: 0.75, contentWeight: 0.25, sourcesMean: null, contentScore: 50, finalScore: 50 },
        analyzedAt: '2026-01-01T00:00:00.000Z',
        contentHash: 'hash',
        sources: [{ id: 1, sourceId: 'src_1', domain: 'example.com', url: 'https://example.com/story', trustScore: 0, type: 'UNAVAILABLE', extractionStatus: 'failed' }],
        liveAnalysis: null,
      },
    }));

    const response = await request(buildApp()).get('/api/articles/article-id');

    expect(response.status).toBe(200);
    expect(response.body.sources[0].analysisStatus).toBe('UNAVAILABLE');
  });

  it('returns analysisStatus UNAVAILABLE (not PENDING) for STALE article with legacy source', async () => {
    articleFindUnique.mockResolvedValueOnce(publishedArticle({
      factCheckStatus: 'STALE',
      factCheckData: {
        version: 1,
        status: 'STALE',
        score: 60,
        supportLevel: 'nuanced',
        calculation: { formula: 'weighted-source-live-v1', sourceWeight: 0.75, contentWeight: 0.25, sourcesMean: null, contentScore: 60, finalScore: 60 },
        analyzedAt: '2026-01-01T00:00:00.000Z',
        contentHash: 'hash',
        sources: [{ id: 1, sourceId: 'src_1', domain: 'example.com', url: 'https://example.com/story', trustScore: null, type: 'PENDING' }],
        liveAnalysis: null,
      },
    }));

    const response = await request(buildApp()).get('/api/articles/article-id');

    expect(response.status).toBe(200);
    expect(response.body.sources[0].analysisStatus).toBe('UNAVAILABLE');
  });

  it('preserves pre-computed analysisStatus from enrichment worker', async () => {
    articleFindUnique.mockResolvedValueOnce(publishedArticle({
      factCheckStatus: 'COMPLETED',
      factCheckData: {
        version: 1,
        status: 'COMPLETED',
        score: 82,
        supportLevel: 'strong',
        calculation: { formula: 'weighted-source-live-v1', sourceWeight: 0.75, contentWeight: 0.25, sourcesMean: 88, contentScore: 64, finalScore: 82 },
        analyzedAt: '2026-01-01T00:00:00.000Z',
        contentHash: 'hash',
        sources: [{ id: 1, sourceId: 'src_1', domain: 'example.com', url: 'https://example.com/story', trustScore: 88, type: 'news', analysisStatus: 'ANALYZED' }],
        liveAnalysis: null,
      },
    }));

    const response = await request(buildApp()).get('/api/articles/article-id');

    expect(response.status).toBe(200);
    expect(response.body.sources[0].analysisStatus).toBe('ANALYZED');
  });

  it('returns the generation status contract from GET /api/articles/:id/status', async () => {
    articleFindUnique.mockResolvedValueOnce(publishedArticle({
      factCheckStatus: 'RUNNING',
      factCheckError: null,
    }));

    const response = await request(buildApp()).get('/api/articles/article-id/status');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 'article-id',
      articleId: 'article-id',
      status: 'PUBLISHED',
      generationStatus: 'RUNNING',
      factCheckStatus: 'RUNNING',
      factCheckError: null,
      error: null,
      updatedAt: '2026-01-02T00:00:00.000Z',
      contentReady: true,
    });
  });
});
