import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stableSourceId } from '../src/lib/structured-article.js';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/epion_test';

let capturedProcessor: (job: any) => Promise<any>;
const workerOn = vi.fn();
const articleFindUnique = vi.fn();
const articleUpdate = vi.fn();
const articleSourceUpsert = vi.fn();
const transaction = vi.fn();
const getRichTrustScore = vi.fn();

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function WorkerMock(_name, processor) {
    capturedProcessor = processor;
    return { on: workerOn };
  }),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function RedisMock() { return {}; }),
}));

vi.mock('../src/lib/db.js', () => ({
  prisma: {
    article: { findUnique: articleFindUnique, update: vi.fn() },
    $transaction: transaction,
  },
}));

vi.mock('../src/lib/trust-score.js', () => ({ getRichTrustScore }));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { startSourceEnrichmentWorker } = await import('../src/workers/source-enrichment.worker.js');

function richScore(durableSourceId?: string) {
  return {
    durableSourceId,
    globalScore: 80,
    confidenceLevel: 'HIGH',
    details: { transparency: 80, editorial: 80, semantic: 80, pluralism: 80 },
    flags: {
      isPlatform: false,
      hasFactCheckFailures: false,
      isAdsTxtValid: true,
      isOwnerPublic: true,
    },
    metadata: {
      name: 'Example',
      justification: 'Audited',
      description: 'Durable profile',
      politicalBias: 'UNKNOWN',
      biasScore: 0,
      reliability: 'HIGH',
      country: 'FR',
      type: 'MEDIA',
    },
    profileData: { description: 'Durable profile', methodVersion: 'source-profile-v1' },
    profileVersion: 1,
    profileConfidence: 'HIGH',
    lastProfiledAt: '2026-07-11T10:00:00.000Z',
    publicTrustLabel: 'strong',
  };
}

function job(sources: string[]) {
  return {
    id: 'job-1',
    data: {
      articleId: 'article-1',
      sources,
      scoreLiveBrut: 75,
      sourceMetadata: Object.fromEntries(sources.map((url) => [url, {
        provider: 'web',
        searchLane: 'FACTUAL',
        role: 'PRIMARY_EVIDENCE',
        provenance: 'WEB_SEARCH',
      }])),
    },
  };
}

describe('source enrichment worker ArticleSource dual-write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    articleFindUnique.mockResolvedValue({ title: 'Title', summary: 'Summary', content: 'Content' });
    articleUpdate.mockResolvedValue({ id: 'article-1' });
    articleSourceUpsert.mockResolvedValue({ id: 'article-source-1' });
    transaction.mockImplementation(async (callback: any) => callback({
      article: { update: articleUpdate },
      articleSource: { upsert: articleSourceUpsert },
    }));
    getRichTrustScore.mockResolvedValue(richScore('real-source-id'));
    startSourceEnrichmentWorker();
  });

  it('atomically upserts distinct URLs and keeps factCheckData.sources compatible', async () => {
    const urls = ['https://example.com/report-a', 'https://example.com/report-b'];
    await capturedProcessor(job(urls));

    expect(transaction).toHaveBeenCalledOnce();
    expect(articleSourceUpsert).toHaveBeenCalledTimes(2);
    const calls = articleSourceUpsert.mock.calls.map(([input]) => input);
    expect(calls[0].where.articleId_sourceUrlHash.sourceUrlHash)
      .not.toBe(calls[1].where.articleId_sourceUrlHash.sourceUrlHash);
    expect(calls.every((input) => input.create.sourceId === 'real-source-id')).toBe(true);
    expect(calls.every((input) => input.create.position === calls.indexOf(input))).toBe(true);

    expect(articleUpdate).toHaveBeenCalledWith({
      where: { id: 'article-1' },
      data: expect.objectContaining({
        factCheckStatus: 'COMPLETED',
        factCheckData: expect.objectContaining({
          sources: expect.arrayContaining([
            expect.objectContaining({
              sourceId: stableSourceId(urls[0], 0),
              durableSourceId: 'real-source-id',
              url: urls[0],
            }),
          ]),
        }),
      }),
    });
  });

  it('uses the same upsert key on BullMQ retry instead of creating duplicates', async () => {
    const inputJob = job(['https://example.com/report?b=2&a=1']);
    await capturedProcessor(inputJob);
    await capturedProcessor(inputJob);

    expect(articleSourceUpsert).toHaveBeenCalledTimes(2);
    expect(articleSourceUpsert.mock.calls[0][0].where)
      .toEqual(articleSourceUpsert.mock.calls[1][0].where);
  });

  it('keeps the legacy flow when durableSourceId is absent', async () => {
    getRichTrustScore.mockResolvedValue(richScore(undefined));
    await capturedProcessor(job(['https://example.com/legacy']));

    expect(articleSourceUpsert).not.toHaveBeenCalled();
    expect(articleUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        factCheckStatus: 'COMPLETED',
        factCheckData: expect.objectContaining({ sources: expect.any(Array) }),
      }),
    }));
  });

  it('never uses the legacy sourceId as the ArticleSource foreign key', async () => {
    const url = 'https://example.com/report';
    await capturedProcessor(job([url]));

    const input = articleSourceUpsert.mock.calls[0][0];
    expect(input.create.sourceId).toBe('real-source-id');
    expect(input.create.sourceId).not.toBe(stableSourceId(url, 0));
  });

  it('does not mark the article completed when an ArticleSource upsert fails', async () => {
    articleSourceUpsert.mockRejectedValue(new Error('ArticleSource write failed'));

    await expect(capturedProcessor(job(['https://example.com/report'])))
      .rejects.toThrow('ArticleSource write failed');
    expect(articleUpdate).not.toHaveBeenCalled();
  });
});
