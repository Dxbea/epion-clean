import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/epion_test';
process.env.OPENAI_API_KEY ??= 'test-openai-key';

let capturedProcessor: any;
const workerOn = vi.fn();
const articleUpdate = vi.fn();
const sourceEnrichmentAdd = vi.fn();
const runLiveAnalysis = vi.fn();
const runLiveAnalysisWithGeneration = vi.fn();

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function WorkerMock(_name, processor) {
    capturedProcessor = processor;
    return { on: workerOn };
  }),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function RedisMock() { return { disconnect: vi.fn() }; }),
}));

vi.mock('../src/lib/db.js', () => ({
  prisma: {
    article: {
      update: articleUpdate,
    },
  },
}));

vi.mock('../src/lib/queue.js', () => ({
  sourceEnrichmentQueue: { add: sourceEnrichmentAdd },
}));

vi.mock('../src/lib/live-analysis/index.js', () => ({
  runLiveAnalysis,
  runLiveAnalysisWithGeneration,
}));

vi.mock('../src/lib/images/wikipedia-fetcher.js', () => ({
  getWikipediaImage: vi.fn(async () => 'https://images.example/cover.jpg'),
}));

const { startLiveAnalysisWorker } = await import('../src/workers/live-analysis.worker.js');

describe('live-analysis article generation worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = undefined;
    articleUpdate.mockResolvedValue({ id: 'article-1' });
    sourceEnrichmentAdd.mockResolvedValue({ id: 'enrich-1' });
    runLiveAnalysisWithGeneration.mockResolvedValue({
      globalScore: 78,
      contentIntent: 'INFORMATIVE',
      pillarScores: { transparency: { score: 80 }, editorial: { score: 75 }, semantic: { score: 79 }, logic: { score: 77 } },
      judges: { primary: {}, auditor: {} },
      sources: [{ url: 'https://example.com/story', domain: 'example.com' }],
      generatedContent: {
        title: 'Generated title',
        summary: 'Generated summary',
        content: 'Generated content',
        structuredContent: { blocks: [] },
        imagePrompt: 'image prompt',
        wikipedia_search_query: 'Generated title',
        tags: ['media'],
        opinionQuestion: {
          question: 'Les faits presentes relevent-ils plutot d un cas ponctuel ou structurel ?',
          thesisA: 'Ponctuel',
          thesisB: 'Structurel',
        },
      },
    });
  });

  it('marks generation running, persists generated content, and chains source enrichment', async () => {
    startLiveAnalysisWorker();

    const result = await capturedProcessor({
      id: 'job-1',
      data: {
        articleId: 'article-1',
        requestedByUserId: 'user-1',
        mode: 'article-generation',
        topic: 'Media literacy',
        language: 'fr',
        style: 'neutral',
        citationUrls: [],
      },
    });

    expect(articleUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: 'article-1' },
      data: expect.objectContaining({
        factCheckStatus: 'RUNNING',
        factCheckError: null,
        factCheckStartedAt: expect.any(Date),
      }),
    });
    expect(articleUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: 'article-1' },
      data: expect.objectContaining({
        title: 'Generated title',
        content: 'Generated content',
        factCheckScore: 78,
        factCheckStatus: 'RUNNING',
        factCheckData: expect.objectContaining({
          liveScore: 78,
          sources: [expect.objectContaining({ url: 'https://example.com/story', type: 'PENDING' })],
        }),
      }),
    });
    expect(result.articleId).toBe('article-1');
    expect(result.citationUrls).toEqual(['https://example.com/story']);
  });
});


