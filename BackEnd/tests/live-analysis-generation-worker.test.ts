import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/epion_test';
process.env.OPENAI_API_KEY ??= 'test-openai-key';

let capturedProcessor: any;
let capturedWorkerOptions: any;
const workerOn = vi.fn();
let workerEvents: Record<string, (job: any, result?: any) => Promise<void> | void>;
const articleUpdate = vi.fn();
const articleFindUnique = vi.fn();
const sourceEnrichmentAdd = vi.fn();
const runLiveAnalysis = vi.fn();
const runLiveAnalysisWithGeneration = vi.fn();
const prepareEvidenceCorpus = vi.fn();

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function WorkerMock(_name, processor, options) {
    capturedProcessor = processor;
    capturedWorkerOptions = options;
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
      findUnique: articleFindUnique,
    },
  },
}));

vi.mock('../src/lib/queue.js', () => ({
  sourceEnrichmentQueue: { add: sourceEnrichmentAdd },
  documentCorpusQueue: { add: vi.fn() },
}));

vi.mock('../src/lib/live-analysis/index.js', () => ({
  runLiveAnalysis,
  runLiveAnalysisWithGeneration,
}));

vi.mock('../src/lib/article-generation-core/evidence-corpus.js', () => ({
  prepareEvidenceCorpus,
}));

vi.mock('../src/lib/images/wikipedia-fetcher.js', () => ({
  getWikipediaImage: vi.fn(async () => 'https://images.example/cover.jpg'),
}));

const { startLiveAnalysisWorker } = await import('../src/workers/live-analysis.worker.js');

describe('live-analysis article generation worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = undefined;
    capturedWorkerOptions = undefined;
    workerEvents = {};
    workerOn.mockImplementation((event: string, handler: (job: any, result?: any) => Promise<void> | void) => {
      workerEvents[event] = handler;
    });
    articleUpdate.mockResolvedValue({ id: 'article-1' });
    articleFindUnique.mockResolvedValue({ content: null, factCheckStatus: 'PENDING' });
    prepareEvidenceCorpus.mockResolvedValue({
      persistence: {
        provider: 'SERPER',
        mode: 'USER_REQUEST',
        considered: 1,
        persisted: [],
      },
      dossier: {
        traceability: 'DEGRADED',
        degradedReasons: ['USED_DOCUMENT_NOT_INDEXED'],
      },
      queuedForCorpus: 1,
      queueFailures: [],
      indexingTimedOut: false,
    });
    sourceEnrichmentAdd.mockImplementation(async (_name: string, _data: unknown, options: { jobId?: string }) => {
      if (options.jobId?.includes(':')) throw new Error('Custom Id cannot contain :');
      return { id: 'enrich-1' };
    });
    runLiveAnalysisWithGeneration.mockResolvedValue({
      globalScore: 78,
      contentIntent: 'INFORMATIVE',
      pillarScores: { transparency: { score: 80 }, editorial: { score: 75 }, semantic: { score: 79 }, logic: { score: 77 } },
      judges: { primary: {}, auditor: {} },
      sources: [{
        url: 'https://example.com/story',
        domain: 'example.com',
        extractionStatus: 'metadata_only',
        provider: 'web',
        searchLane: 'FACTUAL',
        role: 'PRIMARY_EVIDENCE',
        provenance: 'WEB_SEARCH',
      }],
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

  it('uses long-running lock settings for the live-analysis worker only', () => {
    startLiveAnalysisWorker();

    expect(capturedWorkerOptions).toMatchObject({
      concurrency: 3,
      lockDuration: 10 * 60 * 1000,
      stalledInterval: 2 * 60 * 1000,
      maxStalledCount: 2,
    });
  });

  it('marks generation running, atomically finalizes generated content as a completed draft, and returns enrichment data', async () => {
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
        factCheckStatus: 'COMPLETED',
        status: 'DRAFT',
        factCheckCompletedAt: expect.any(Date),
        factCheckError: null,
        factCheckData: expect.objectContaining({
          status: 'COMPLETED',
          liveScore: 78,
          sources: [expect.objectContaining({ url: 'https://example.com/story', type: 'PENDING' })],
        }),
      }),
    });
    expect(result.articleId).toBe('article-1');
    expect(result.citationUrls).toEqual(['https://example.com/story']);
    const generationOptions = runLiveAnalysisWithGeneration.mock.calls[0]?.[1];
    expect(generationOptions).toMatchObject({
      language: 'fr',
      style: 'neutral',
      onEvidenceGathered: expect.any(Function),
    });

    await expect(generationOptions.onEvidenceGathered([
      {
        url: 'https://example.com/story?utm_source=test',
        title: 'Story title',
        content: 'Extracted content is not persisted by this hook.',
        metaDescription: 'Search result excerpt',
        publishedDate: '2026-07-25',
        domain: 'example.com',
        score: 0.8,
        provider: 'web',
        searchLane: 'FACTUAL',
        role: 'PRIMARY_EVIDENCE',
        provenance: 'WEB_SEARCH',
        extractionStatus: 'metadata_only',
      },
      {
        url: 'https://internal.example/document',
        title: 'Internal document',
        content: 'Internal corpus content',
        domain: 'internal.example',
        score: 0.7,
        provider: 'rag',
        provenance: 'INTERNAL_RAG',
      },
    ])).resolves.toMatchObject({
      traceability: 'DEGRADED',
      degradedReasons: ['USED_DOCUMENT_NOT_INDEXED'],
    });

    expect(prepareEvidenceCorpus).toHaveBeenCalledWith(
      expect.objectContaining({
        client: expect.any(Object),
        documentQueue: expect.any(Object),
      }),
      expect.objectContaining({
        request: expect.objectContaining({ mode: 'USER_REQUEST', language: 'fr' }),
        persistence: expect.objectContaining({
          provider: 'SERPER',
          maxCandidates: 50,
          candidates: [expect.objectContaining({
            url: 'https://example.com/story?utm_source=test',
            title: 'Story title',
            snippet: 'Search result excerpt',
            publishedAt: '2026-07-25',
            language: 'fr',
            metadata: expect.objectContaining({
              searchLane: 'FACTUAL',
              provenance: 'WEB_SEARCH',
            }),
          })],
        }),
      }),
    );

    await workerEvents.completed(
      { id: 'job-1', data: { articleId: 'article-1', mode: 'article-generation', requestedByUserId: 'user-1' } },
      result,
    );

    expect(sourceEnrichmentAdd).toHaveBeenCalledWith(
      'enrich',
      expect.objectContaining({
        sourceMetadata: {
          'https://example.com/story': {
            extractionStatus: 'metadata_only',
            provider: 'web',
            searchLane: 'FACTUAL',
            role: 'PRIMARY_EVIDENCE',
            provenance: 'WEB_SEARCH',
          },
        },
      }),
      expect.objectContaining({ jobId: 'source-enrichment-article-1' }),
    );
  });

  it('does not fail user generation when corpus persistence is unavailable', async () => {
    startLiveAnalysisWorker();
    prepareEvidenceCorpus.mockRejectedValueOnce(new Error('corpus unavailable'));

    await capturedProcessor({
      id: 'job-2',
      data: {
        articleId: 'article-1',
        requestedByUserId: 'user-1',
        mode: 'article-generation',
        topic: 'Media literacy',
        citationUrls: [],
      },
    });

    const generationOptions = runLiveAnalysisWithGeneration.mock.calls[0]?.[1];
    await expect(generationOptions.onEvidenceGathered([{
      url: 'https://example.com/story',
      title: 'Story title',
      content: 'Content',
      domain: 'example.com',
      score: 0.8,
      provider: 'web',
    }])).resolves.toMatchObject({
      mode: 'USER_REQUEST',
      traceability: 'DEGRADED',
      degradedReasons: ['CORPUS_PERSISTENCE_FAILED', 'FOUND_NOT_PERSISTED'],
      items: [expect.objectContaining({ status: 'FOUND' })],
    });
  });
});


