import type {
  ArticleGenerationMode,
  ArticleGenerationPolicy,
  ArticleGenerationPolicyOverrides,
} from './types.js';

const PUBLICATION_GATE = {
  minimumArticleSources: 2,
  minimumIndependentDomains: 2,
  requireVerificationPassed: true,
  requireCompleteFactScore: true,
  requireCategory: true,
} as const;

export function resolveArticleGenerationPolicy(
  mode: ArticleGenerationMode,
  overrides: ArticleGenerationPolicyOverrides = {},
): ArticleGenerationPolicy {
  const base: ArticleGenerationPolicy = mode === 'USER_REQUEST'
    ? {
        evidence: {
          minimumSources: 1,
          minimumDomains: 1,
          maximumSources: 50,
          maximumPaidQueries: 3,
        },
        discovery: {
          lowCostFirst: false,
          maximumDocuments: 50,
          maximumQueries: 3,
          allowedProvenances: ['SERPER', 'MANUAL'],
        },
        latency: {
          deadlineMs: 5 * 60_000,
          corpusWaitMs: 0,
          allowDegradedDraft: true,
        },
        publication: {
          draftOnly: true,
          ...PUBLICATION_GATE,
        },
      }
    : {
        evidence: {
          minimumSources: 2,
          minimumDomains: 2,
          maximumSources: 20,
          maximumPaidQueries: 2,
        },
        discovery: {
          lowCostFirst: true,
          maximumDocuments: 20,
          maximumQueries: 2,
          allowedProvenances: [
            'RSS',
            'ATOM',
            'SITEMAP',
            'GDELT',
            'GOOGLE_NEWS_RSS',
            'SERPER',
            'MANUAL',
          ],
        },
        latency: {
          deadlineMs: 60 * 60_000,
          corpusWaitMs: 20 * 60_000,
          allowDegradedDraft: false,
        },
        publication: {
          draftOnly: false,
          ...PUBLICATION_GATE,
        },
      };

  return {
    evidence: { ...base.evidence, ...overrides.evidence },
    discovery: { ...base.discovery, ...overrides.discovery },
    latency: { ...base.latency, ...overrides.latency },
    publication: { ...base.publication, ...overrides.publication },
  };
}
