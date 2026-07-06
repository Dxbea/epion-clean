import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/epion_test';
process.env.OPENAI_API_KEY ??= 'test-openai-key';

const searchSerper = vi.fn();
const extractArticle = vi.fn();
const searchInternalSources = vi.fn();
const classifyAndRoute = vi.fn();

vi.mock('../src/lib/serper.js', () => ({ searchSerper }));
vi.mock('../src/lib/extractor.js', () => ({ extractArticle }));
vi.mock('../src/lib/rag-service.js', () => ({ searchInternalSources }));
vi.mock('../src/lib/live-analysis/smart-router.js', () => ({ classifyAndRoute }));

const { investigateArticle } = await import('../src/lib/live-analysis/fact-investigator.js');

describe('live-analysis source metadata fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    classifyAndRoute.mockResolvedValue({
      route: 'HOT_NEWS',
      query_factual: 'factual query',
      query_critical: 'critical query',
      query_contextual: 'contextual query',
    });
    searchInternalSources.mockResolvedValue([]);
    extractArticle.mockRejectedValue(new Error('Extraction returned empty HTML'));
  });

  it('keeps Serper title, snippet, and URL as weak metadata-only sources when extraction returns empty HTML', async () => {
    searchSerper.mockImplementation(async (query: string) => [
      {
        title: `Official update for ${query}`,
        url: `https://official.example/${query.replace(/\s+/g, '-')}`,
        content: 'Official company metadata snippet with enough detail to seed a cautious generated article source.',
        publishedDate: '2026-07-06',
        score: 0.95,
      },
      {
        title: `News result for ${query}`,
        url: `https://news.example/${query.replace(/\s+/g, '-')}`,
        content: 'Credible news metadata snippet with enough detail to be cited as limited search metadata.',
        score: 0.85,
      },
    ]);

    const result = await investigateArticle('Automotive supplier outlook', 'Automotive supplier outlook');

    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources.every((source) => source.extractionStatus === 'metadata_only')).toBe(true);
    expect(result.sources[0]).toMatchObject({
      url: 'https://official.example/factual-query',
      title: 'Official update for factual query',
      provider: 'web',
      sourceQuality: 'metadata_only',
      extractionFailureReason: 'Extraction returned empty HTML',
    });
    expect(result.sources[0].content).toContain('METADATA-ONLY SOURCE');
  });

  it('returns zero sources when extraction fails and Serper has no usable snippet metadata', async () => {
    searchSerper.mockResolvedValue([
      {
        title: 'Empty snippet',
        url: 'https://example.com/empty',
        content: '',
        score: 0.9,
      },
    ]);

    const result = await investigateArticle('Thin result', 'Thin result');

    expect(result.sources).toEqual([]);
  });
});
