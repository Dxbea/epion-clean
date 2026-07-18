import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildArticleFinalizationContract,
  finalizeArticleAnalysis,
} from '../src/lib/article-finalization.js';
import type { SourceScoreEntry } from '../src/lib/score-types.js';
import type { StructuredArticleContent } from '../src/types/structured-article.js';

const completedAt = new Date('2026-07-20T10:00:00.000Z');
const structuredContent: StructuredArticleContent = {
  version: 1,
  format: 'epion-article-v1',
  lead: { summary: 'Summary' },
  sections: [{ id: 'facts', type: 'facts', title: 'Facts', items: [{ text: 'A supported fact.' }] }],
  claims: [{ id: 'claim-1', text: 'A supported fact.', sectionId: 'facts', sourceIds: ['src-one'], support: 'strong' }],
};

function source(overrides: Partial<SourceScoreEntry> = {}): SourceScoreEntry {
  return {
    id: 1,
    sourceId: 'src-one',
    durableSourceId: 'source-one',
    domain: 'one.example',
    name: 'One',
    url: 'https://one.example/report',
    trustScore: 80,
    type: 'MEDIA',
    logo: '',
    description: null,
    justification: null,
    metrics: null,
    flags: null,
    analysisStatus: 'ANALYZED',
    extractionStatus: 'full',
    role: 'PRIMARY_EVIDENCE',
    provenance: 'WEB_SEARCH',
    profileData: null,
    profileVersion: 1,
    profileConfidence: null,
    lastProfiledAt: null,
    publicTrustLabel: null,
    metadata: { supportStrength: 'STRONG' },
    ...overrides,
  };
}

function input(sources = [source()]) {
  return {
    articleId: 'article-1',
    title: 'Shared generated article',
    summary: 'Summary',
    content: 'Body',
    structuredContent,
    contentScore: 80,
    sources,
    liveAnalysis: { contentIntent: 'REPORT' },
    completedAt,
  };
}

describe('shared Article finalization contract', () => {
  afterEach(() => vi.useRealTimers());

  it('builds the canonical FactScore, public sources and durable ArticleSource writes together', () => {
    vi.useFakeTimers();
    vi.setSystemTime(completedAt);
    const contract = buildArticleFinalizationContract(input());

    expect(contract).toMatchObject({
      articleId: 'article-1',
      structuredContent: { version: 1, format: 'epion-article-v1' },
      factCheckStatus: 'COMPLETED',
      factCheckScore: 80,
      factCheckData: {
        version: 1,
        status: 'COMPLETED',
        score: 80,
        supportLevel: 'strong',
        sources: [expect.objectContaining({ durableSourceId: 'source-one' })],
      },
      publicSources: [expect.objectContaining({ url: 'https://one.example/report' })],
    });
    expect(contract.factCheckData.contentHash).toBe(contract.factCheckContentHash);
    expect(contract.factCheckData.analyzedAt).toBe(completedAt.toISOString());
    expect(contract.articleSourceUpserts).toHaveLength(1);
    expect(contract.articleSourceUpserts[0].create).toMatchObject({
      articleId: 'article-1',
      sourceId: 'source-one',
      role: 'PRIMARY_EVIDENCE',
      provenance: 'WEB_SEARCH',
      supportStrength: 'STRONG',
    });
  });

  it('persists ArticleSource and FactScore in one transaction', async () => {
    const articleSourceUpsert = vi.fn(async () => ({}));
    const articleUpdate = vi.fn(async () => ({}));
    const client = {
      $transaction: vi.fn(async (callback: any) => callback({
        articleSource: { upsert: articleSourceUpsert },
        article: { update: articleUpdate },
      })),
    } as unknown as PrismaClient;

    const contract = await finalizeArticleAnalysis(client, input());

    expect(articleSourceUpsert).toHaveBeenCalledOnce();
    expect(articleUpdate).toHaveBeenCalledWith({
      where: { id: 'article-1' },
      data: expect.objectContaining({
        structuredContent: expect.objectContaining({ format: 'epion-article-v1' }),
        factCheckStatus: 'COMPLETED',
        factCheckScore: contract.factCheckScore,
        factCheckContentHash: contract.factCheckContentHash,
        factCheckError: null,
      }),
    });
  });

  it('produces the same public Article contract for equivalent user-prompt and editorial inputs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(completedAt);
    const userPromptContract = buildArticleFinalizationContract(input());
    const editorialContract = buildArticleFinalizationContract(input());
    const publicContract = (contract: typeof userPromptContract) => ({
      structuredContent: contract.structuredContent,
      factCheckStatus: contract.factCheckStatus,
      factCheckData: contract.factCheckData,
      factCheckScore: contract.factCheckScore,
      factCheckContentHash: contract.factCheckContentHash,
      sources: contract.publicSources,
    });

    expect(publicContract(editorialContract)).toEqual(publicContract(userPromptContract));
  });

  it('returns FAILED without sources instead of manufacturing a sourced score state', () => {
    const contract = buildArticleFinalizationContract(input([]));
    expect(contract.factCheckStatus).toBe('FAILED');
    expect(contract.factCheckData.status).toBe('FAILED');
    expect(contract.articleSourceUpserts).toEqual([]);
  });
});
