import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/epion_test';

let capturedProcessor: any;
const workerOn = vi.fn();
const articleFindUnique = vi.fn();
const articleCreate = vi.fn();
const embeddingAdd = vi.fn();
const extractArticle = vi.fn();
const persistWebEvidenceCandidates = vi.fn();
const childLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('bullmq', () => ({
  DelayedError: class DelayedError extends Error {},
  Worker: vi.fn().mockImplementation(function WorkerMock(_name, processor) {
    capturedProcessor = processor;
    return { on: workerOn };
  }),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function RedisMock() {
    return {};
  }),
}));

vi.mock('../src/lib/db.js', () => ({
  prisma: {
    article: {
      findUnique: articleFindUnique,
      create: articleCreate,
    },
  },
}));

vi.mock('../src/lib/logger.js', () => ({
  default: {
    child: vi.fn(() => childLogger),
  },
}));

vi.mock('../src/lib/queue.js', () => ({
  newsIngestionQueue: { add: vi.fn() },
  embeddingQueue: { add: embeddingAdd },
}));

vi.mock('../src/lib/extractor.js', () => ({
  DomainCircuitOpenError: class DomainCircuitOpenError extends Error {},
  isOperationalExtractionError: vi.fn(() => false),
  extractArticle,
}));

vi.mock('../src/lib/discovery.js', () => ({
  claimDiscoveredUrl: vi.fn(),
  DEDUP_URLS_KEY: 'dedup:test',
  fetchGdeltArticleList: vi.fn(),
  fetchSitemapUrls: vi.fn(),
}));

vi.mock('../src/lib/article-generation-core/evidence-gathering.js', () => ({
  persistWebEvidenceCandidates,
}));

const { startNewsWorker } = await import('../src/workers/news-worker.js');

describe('legacy news corpus bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = undefined;
    articleFindUnique.mockResolvedValue(null);
    articleCreate.mockResolvedValue({ id: 'article-legacy-1' });
    embeddingAdd.mockResolvedValue({ id: 'embedding-1' });
    extractArticle.mockResolvedValue({
      title: 'Extracted title',
      content: 'Extracted article content',
      author: 'Reporter',
      siteName: 'Example News',
    });
    persistWebEvidenceCandidates.mockResolvedValue({
      provider: 'GDELT',
      mode: 'AUTO_EDITORIAL',
      considered: 1,
      persisted: [{ documentId: 'document-gdelt-1' }],
    });
  });

  it('persists the discovered identity before keeping the compatibility Article DRAFT write', async () => {
    startNewsWorker();

    await capturedProcessor({
      id: 'news-job-1',
      name: 'ingest-url',
      data: {
        url: 'https://example.com/gdelt-story',
        title: 'GDELT title',
        publishedAt: '2026-07-25',
        source: 'gdelt',
      },
    });

    expect(persistWebEvidenceCandidates).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        mode: 'AUTO_EDITORIAL',
        provider: 'GDELT',
        maxCandidates: 1,
        candidates: [{
          url: 'https://example.com/gdelt-story',
          title: 'GDELT title',
          publishedAt: '2026-07-25',
          metadata: {
            legacyNewsBridge: true,
            legacyDiscoverySource: 'gdelt',
          },
        }],
      }),
    );
    expect(extractArticle).toHaveBeenCalledWith(
      'https://example.com/gdelt-story',
      { jobId: 'news-job-1' },
    );
    expect(articleCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'DRAFT',
        generationConfig: expect.objectContaining({
          sourceUrl: 'https://example.com/gdelt-story',
          discoverySource: 'gdelt',
          ingestedDocumentId: 'document-gdelt-1',
        }),
      }),
    });
  });

  it('keeps legacy draft creation available when the corpus bridge fails', async () => {
    startNewsWorker();
    persistWebEvidenceCandidates.mockRejectedValueOnce(new Error('corpus unavailable'));

    await capturedProcessor({
      id: 'news-job-2',
      name: 'ingest-url',
      data: {
        url: 'https://example.com/sitemap-story',
        source: 'sitemap',
      },
    });

    expect(articleCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'DRAFT',
        generationConfig: expect.objectContaining({
          discoverySource: 'sitemap',
          ingestedDocumentId: null,
        }),
      }),
    });
  });
});
