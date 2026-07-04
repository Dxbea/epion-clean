import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchSerperMock = vi.fn();
const extractArticleMock = vi.fn();

vi.mock('../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

vi.mock('../src/lib/live-analysis/smart-router.js', () => ({
  classifyAndRoute: vi.fn(async () => ({
    route: 'MIXED',
    query_factual: 'fact query',
    query_critical: 'critical query',
    query_contextual: 'context query',
  })),
}));

vi.mock('../src/lib/serper.js', () => ({
  searchSerper: searchSerperMock,
}));

vi.mock('../src/lib/extractor.js', () => ({
  extractArticle: extractArticleMock,
}));

vi.mock('../src/lib/rag-service.js', () => ({
  searchInternalSources: vi.fn(async () => []),
}));

const {
  GENERATION_EXTRACTION_CONCURRENCY,
  MAX_GENERATION_EXTRACTION_URLS,
  investigateArticle,
} = await import('../src/lib/live-analysis/fact-investigator.js');

function buildResults(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    title: `${prefix} ${index}`,
    url: `https://${prefix}-${index}.example/story`,
    content: `${prefix} snippet ${index}`,
    score: 1 - index * 0.01,
  }));
}

function extractedDocument(url: string) {
  return {
    title: `Title for ${url}`,
    content: `fact query critical query context query paragraph for ${url} `.repeat(40),
  };
}

describe('generation source investigation limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchSerperMock.mockImplementation(async (query: string) => {
      const prefix = query.split(' ')[0];
      return buildResults(prefix, 30);
    });
    extractArticleMock.mockImplementation(async (url: string) => extractedDocument(url));
  });

  it('limits generation extraction to 12 URLs with concurrency 3', async () => {
    let activeExtractions = 0;
    let maxActiveExtractions = 0;

    extractArticleMock.mockImplementation(async (url: string) => {
      activeExtractions += 1;
      maxActiveExtractions = Math.max(maxActiveExtractions, activeExtractions);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeExtractions -= 1;
      return extractedDocument(url);
    });

    const context = await investigateArticle('topic', 'topic', undefined, {
      mode: 'generation',
    });

    expect(searchSerperMock).toHaveBeenCalledTimes(3);
    expect(extractArticleMock).toHaveBeenCalledTimes(MAX_GENERATION_EXTRACTION_URLS);
    expect(maxActiveExtractions).toBeLessThanOrEqual(GENERATION_EXTRACTION_CONCURRENCY);
    expect(context.sources).toHaveLength(MAX_GENERATION_EXTRACTION_URLS);
  });
});

