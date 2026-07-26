import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/epion_test';

const investigateArticle = vi.fn();
const runPrimaryJudge = vi.fn();
const runPrimaryJudgeWithGeneration = vi.fn();
const runAuditorJudge = vi.fn();

vi.mock('../src/lib/live-analysis/fact-investigator.js', () => ({
  investigateArticle,
}));

vi.mock('../src/lib/live-analysis/primary-judge.js', () => ({
  runPrimaryJudge,
  runPrimaryJudgeWithGeneration,
}));

vi.mock('../src/lib/live-analysis/auditor-judge.js', () => ({
  runAuditorJudge,
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const { runLiveAnalysisWithGeneration } = await import('../src/lib/live-analysis/index.js');

describe('live-analysis generation evidence hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('awaits evidence persistence after investigation and before article generation', async () => {
    const sequence: string[] = [];
    const sources = [{
      url: 'https://example.com/story',
      title: 'Story',
      content: 'Extracted content',
      domain: 'example.com',
      score: 0.8,
      provider: 'web' as const,
    }];
    investigateArticle.mockResolvedValue({
      sources,
      routingDecision: {
        route: 'MIXED',
        query_factual: 'facts',
        query_critical: 'criticism',
        query_contextual: 'context',
      },
    });
    runPrimaryJudgeWithGeneration.mockImplementation(async () => {
      sequence.push('generate');
      throw new Error('stop after order assertion');
    });

    await expect(runLiveAnalysisWithGeneration('Topic', {
      language: 'fr',
      style: 'neutral',
      onEvidenceGathered: async (gatheredSources) => {
        sequence.push('persist');
        expect(gatheredSources).toBe(sources);
      },
    })).rejects.toThrow('stop after order assertion');

    expect(sequence).toEqual(['persist', 'generate']);
    expect(runPrimaryJudgeWithGeneration).toHaveBeenCalledWith(
      'Topic',
      expect.objectContaining({ sources }),
      { language: 'fr', style: 'neutral' },
    );
  });

  it('uses the dossier as generation input and marks only cited persisted evidence USED', async () => {
    const sources = [
      {
        url: 'https://one.example/story',
        title: 'One',
        content: 'Persisted evidence',
        domain: 'one.example',
        score: 0.8,
        provider: 'web' as const,
      },
      {
        url: 'https://two.example/unpersisted',
        title: 'Two',
        content: 'Unpersisted evidence',
        domain: 'two.example',
        score: 0.7,
        provider: 'web' as const,
      },
    ];
    investigateArticle.mockResolvedValue({
      sources,
      routingDecision: {
        route: 'MIXED',
        query_factual: 'facts',
        query_critical: 'criticism',
        query_contextual: 'context',
      },
    });
    const dossier = {
      mode: 'USER_REQUEST' as const,
      items: [{
        ingestedDocumentId: 'doc-1',
        chunkIds: [],
        sourceId: 'source-1',
        canonicalUrl: 'https://one.example/story',
        domain: 'one.example',
        title: 'One',
        role: 'PRIMARY' as const,
        status: 'PERSISTED' as const,
        claimKeys: [],
        provenance: 'SERPER' as const,
        traceability: 'COMPLETE' as const,
      }],
      traceability: 'COMPLETE' as const,
      degradedReasons: [],
      persistedDocuments: 1,
      indexedDocuments: 0,
      usedEvidenceItems: 0,
    };
    const verdict = {
      contentIntent: 'REPORT' as const,
      globalScore: 75,
      pillarScores: {
        transparency: { score: 75, quote: '', reasoning: '' },
        editorial: { score: 75, quote: '', reasoning: '' },
        semantic: { score: 75, quote: '', reasoning: '' },
        logic: { score: 75, quote: '', reasoning: '' },
      },
    };
    runPrimaryJudgeWithGeneration.mockImplementation(async (_topic, context) => {
      expect(context.sources).toEqual([
        expect.objectContaining({
          url: 'https://one.example/story',
          evidenceStatus: 'PERSISTED',
          ingestedDocumentId: 'doc-1',
        }),
      ]);
      return {
        ...verdict,
        generatedContent: {
          title: 'Title',
          summary: 'Summary',
          content: 'Content',
          tags: [],
          imagePrompt: null,
          wikipedia_search_query: null,
          structuredContent: {
            version: 1,
            format: 'epion-article-v1',
            lead: {},
            sections: [{ id: 'facts', type: 'facts', title: 'Facts', body: 'Body' }],
            claims: [{
              id: 'claim_1',
              text: 'Claim',
              sourceUrls: ['https://one.example/story'],
              support: 'strong',
            }],
            sources: [{ id: 'src_one', url: 'https://one.example/story' }],
          },
        },
      };
    });
    runAuditorJudge.mockResolvedValue(verdict);

    const result = await runLiveAnalysisWithGeneration('Topic', {
      onEvidenceGathered: async () => dossier,
    });

    expect(result.sources).toHaveLength(1);
    expect(result.evidenceDossier).toMatchObject({
      traceability: 'DEGRADED',
      degradedReasons: ['USED_DOCUMENT_NOT_INDEXED'],
      usedEvidenceItems: 1,
      items: [expect.objectContaining({
        status: 'USED',
        claimKeys: ['claim_1'],
      })],
    });
  });

  it('keeps a rich USER_REQUEST dossier and exposes several genuinely cited sources', async () => {
    const sources = Array.from({ length: 9 }, (_, index) => ({
      url: `https://source-${index + 1}.example/story`,
      title: `Source ${index + 1}`,
      content: `Evidence ${index + 1}`,
      domain: `source-${index + 1}.example`,
      score: 0.9 - index * 0.02,
      provider: 'web' as const,
    }));
    investigateArticle.mockResolvedValue({
      sources,
      routingDecision: {
        route: 'MIXED',
        query_factual: 'facts',
        query_critical: 'criticism',
        query_contextual: 'context',
      },
    });
    const dossier = {
      mode: 'USER_REQUEST' as const,
      items: sources.map((source, index) => ({
        ingestedDocumentId: `doc-${index + 1}`,
        chunkIds: [],
        sourceId: `durable-${index + 1}`,
        canonicalUrl: source.url,
        domain: source.domain,
        title: source.title,
        role: index === 0 ? 'PRIMARY' as const : 'CONTEXT' as const,
        status: 'PERSISTED' as const,
        claimKeys: [],
        provenance: 'SERPER' as const,
        traceability: 'COMPLETE' as const,
      })),
      traceability: 'COMPLETE' as const,
      degradedReasons: [],
      persistedDocuments: sources.length,
      indexedDocuments: 0,
      usedEvidenceItems: 0,
    };
    const verdict = {
      contentIntent: 'REPORT' as const,
      globalScore: 82,
      pillarScores: {
        transparency: { score: 82, quote: '', reasoning: '' },
        editorial: { score: 82, quote: '', reasoning: '' },
        semantic: { score: 82, quote: '', reasoning: '' },
        logic: { score: 82, quote: '', reasoning: '' },
      },
    };
    runPrimaryJudgeWithGeneration.mockResolvedValue({
      ...verdict,
      generatedContent: {
        title: 'Multi-source article',
        summary: 'Summary',
        content: 'Content',
        tags: [],
        imagePrompt: null,
        wikipedia_search_query: null,
        structuredContent: {
          version: 1,
          format: 'epion-article-v1',
          lead: {},
          sections: [{ id: 'facts', type: 'facts', title: 'Facts', body: 'Body' }],
          claims: sources.slice(0, 4).map((source, index) => ({
            id: `claim-${index + 1}`,
            text: `Supported claim ${index + 1}`,
            sourceUrls: [source.url],
            support: 'strong',
          })),
          sources: sources.map((source, index) => ({
            id: `src-${index + 1}`,
            url: source.url,
          })),
        },
      },
    });
    runAuditorJudge.mockResolvedValue(verdict);

    const result = await runLiveAnalysisWithGeneration('Rich topic', {
      onEvidenceGathered: async () => dossier,
    });

    expect(result.sources).toHaveLength(9);
    expect(result.evidenceDossier?.usedEvidenceItems).toBe(4);
    expect(result.evidenceDossier?.items.filter((item) => item.status === 'USED')).toEqual(
      sources.slice(0, 4).map((source, index) => expect.objectContaining({
        canonicalUrl: source.url,
        claimKeys: [`claim-${index + 1}`],
      })),
    );
  });
});
