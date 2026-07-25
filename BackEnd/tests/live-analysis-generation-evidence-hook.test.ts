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
});
