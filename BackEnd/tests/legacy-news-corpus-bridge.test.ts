import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/epion_test';

let capturedProcessor: any;
const workerOn = vi.fn();
const articleFindUnique = vi.fn();
const articleCreate = vi.fn();
const embeddingAdd = vi.fn();
const extractArticle = vi.fn();
const prepareEvidenceCorpus = vi.fn();
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
  documentCorpusQueue: { add: vi.fn() },
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

vi.mock('../src/lib/article-generation-core/evidence-corpus.js', () => ({
  prepareEvidenceCorpus,
}));

const {
  legacyNewsDirectArticleEnabled,
  startNewsWorker,
} = await import('../src/workers/news-worker.js');

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
    prepareEvidenceCorpus.mockResolvedValue({
      persistence: {
        provider: 'GDELT',
        mode: 'AUTO_EDITORIAL',
        considered: 1,
        persisted: [{ documentId: 'document-gdelt-1' }],
      },
      dossier: { traceability: 'DEGRADED' },
      queuedForCorpus: 1,
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

    expect(prepareEvidenceCorpus).toHaveBeenCalledWith(
      expect.objectContaining({
        client: expect.any(Object),
        documentQueue: expect.any(Object),
      }),
      expect.objectContaining({
        request: expect.objectContaining({ mode: 'AUTO_EDITORIAL' }),
        persistence: expect.objectContaining({
          provider: 'GDELT',
          maxCandidates: 1,
          candidates: [expect.objectContaining({
            url: 'https://example.com/gdelt-story',
            title: 'GDELT title',
            publishedAt: '2026-07-25',
            metadata: {
              legacyNewsBridge: true,
              legacyDiscoverySource: 'gdelt',
            },
          })],
        }),
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
    prepareEvidenceCorpus.mockRejectedValueOnce(new Error('corpus unavailable'));

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

  it('supports disabling only the legacy direct Article write after corpus handoff', async () => {
    const previous = process.env.LEGACY_NEWS_DIRECT_ARTICLE_ENABLED;
    process.env.LEGACY_NEWS_DIRECT_ARTICLE_ENABLED = 'false';
    try {
      startNewsWorker();
      await capturedProcessor({
        id: 'news-job-3',
        name: 'ingest-url',
        data: {
          url: 'https://example.com/corpus-only',
          source: 'gdelt',
        },
      });

      expect(legacyNewsDirectArticleEnabled()).toBe(false);
      expect(prepareEvidenceCorpus).toHaveBeenCalledOnce();
      expect(extractArticle).not.toHaveBeenCalled();
      expect(articleCreate).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.LEGACY_NEWS_DIRECT_ARTICLE_ENABLED;
      else process.env.LEGACY_NEWS_DIRECT_ARTICLE_ENABLED = previous;
    }
  });
});
