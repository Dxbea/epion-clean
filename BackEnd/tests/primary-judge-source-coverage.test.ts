import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createCompletion } = vi.hoisted(() => ({
  createCompletion: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createCompletion } };
  },
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { runPrimaryJudgeWithGeneration } = await import(
  '../src/lib/live-analysis/primary-judge.js'
);

function completion(sourceUrls: string[]) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          article: {
            title: 'Covered article',
            summary: 'Summary',
            content: 'Content',
            structuredContent: {
              version: 1,
              format: 'epion-article-v1',
              lead: {},
              sections: [{ id: 'facts', type: 'facts', title: 'Facts', body: 'Body' }],
              claims: sourceUrls.map((url, index) => ({
                id: `claim-${index + 1}`,
                text: `Claim ${index + 1}`,
                sourceUrls: [url],
                support: 'strong',
              })),
              sources: sourceUrls.map((url, index) => ({ id: `src-${index + 1}`, url })),
            },
            tags: [],
          },
          analysis: {
            contentIntent: 'REPORT',
            pillarScores: {
              transparency: { score: 80 },
              editorial: { score: 80 },
              semantic: { score: 80 },
              logic: { score: 80 },
            },
          },
        }),
      },
    }],
  };
}

describe('primary judge multi-source coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('repairs a 12+ source USER_REQUEST generation until six precise citations span four domains', async () => {
    const sources = Array.from({ length: 14 }, (_, index) => ({
      url: `https://publisher-${index + 1}.example/story`,
      title: `Publisher ${index + 1}`,
      content: `Evidence ${index + 1}`,
      domain: `publisher-${index + 1}.example`,
      score: 0.9,
      provider: 'web' as const,
    }));
    createCompletion
      .mockResolvedValueOnce(completion([sources[0].url]))
      .mockResolvedValueOnce(completion(sources.slice(0, 3).map((source) => source.url)))
      .mockResolvedValueOnce(completion(sources.slice(0, 6).map((source) => source.url)));

    const verdict = await runPrimaryJudgeWithGeneration('Topic', {
      sources,
      routingDecision: {
        route: 'MIXED',
        query_factual: 'facts',
        query_critical: 'criticism',
        query_contextual: 'context',
      },
    });

    expect(createCompletion).toHaveBeenCalledTimes(3);
    expect(createCompletion.mock.calls[1][0].messages[1].content).toContain(
      'au moins 6 sources distinctes issues d\'au moins 4 domaines distincts',
    );
    expect(verdict.generatedContent?.structuredContent?.claims).toHaveLength(6);
  });
});
