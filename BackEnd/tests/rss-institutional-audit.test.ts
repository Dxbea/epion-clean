import { describe, expect, it } from 'vitest';
import { auditInstitutionalRssCandidate, validatedWhitelist } from '../src/scripts/audit-rss-institutional-sources.js';

const candidate = {
  key: 'institution-test', name: 'Institution de test', domain: 'example.gov', rssUrl: 'https://example.gov/feed.xml',
  category: 'POLITICS', country: 'FR', institutionType: 'GOVERNMENT', priority: 1, language: 'fr', licenseNote: 'Official source.',
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    now: () => new Date('2026-07-20T12:00:00.000Z'),
    robotsChecker: { check: async () => ({ allowed: true, retryable: false, reason: 'robots_allowed', robotsUrl: 'https://example.gov/robots.txt', checkedAt: new Date() }) },
    get: async (url: string) => url.endsWith('feed.xml')
      ? { status: 200, data: '<rss><channel><item><title>Document</title><link>https://example.gov/articles/one</link></item></channel></rss>', headers: { 'content-type': 'application/rss+xml' } }
      : { status: 200, data: `<html><body>${'Document institutionnel '.repeat(80)}</body></html>`, headers: { 'content-type': 'text/html' } },
    extract: () => 'a'.repeat(1_500),
    ...overrides,
  };
}

describe('institutional RSS audit', () => {
  it('validates only an RSS feed whose article is robots-allowed and extractable', async () => {
    const result = await auditInstitutionalRssCandidate(candidate, dependencies());
    expect(result.status).toBe('VALIDATED_FULL_FETCH');
    expect(result.validation).toMatchObject({ rssStatus: 'OK', robotsStatus: 'ALLOWED', fetchStatus: 'OK', extractStatus: 'OK', sampleExtractedCharacters: 1500 });
    expect(validatedWhitelist([result])).toHaveLength(1);
  });

  it('does not whitelist a feed when robots blocks the sampled article', async () => {
    const result = await auditInstitutionalRssCandidate(candidate, dependencies({ robotsChecker: { check: async () => ({ allowed: false, retryable: false, reason: 'robots_disallowed', robotsUrl: 'https://example.gov/robots.txt', checkedAt: new Date() }) } }));
    expect(result.status).toBe('ROBOTS_BLOCKED');
    expect(validatedWhitelist([result])).toEqual([]);
  });

  it('classifies a technically readable but insufficient article as too short', async () => {
    const result = await auditInstitutionalRssCandidate(candidate, dependencies({ extract: () => 'court' }));
    expect(result.status).toBe('TOO_SHORT');
    expect(result.validation.extractStatus).toBe('TOO_SHORT');
  });
});
