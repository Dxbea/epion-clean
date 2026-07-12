import { describe, expect, it } from 'vitest';
import { buildArticleLightAnalysis } from '../src/lib/article-light-analysis.js';

const analyzedAt = '2026-07-12T00:00:00.000Z';

function relation(overrides: Record<string, unknown> = {}) {
  return {
    sourceId: 'durable-source',
    sourceUrl: 'https://example.com/report',
    role: 'CONTEXT',
    profileSnapshot: {
      profileData: { description: 'Profil historique', methodVersion: 'source-profile-v1' },
      profileConfidence: 'HIGH',
      publicTrustLabel: 'strong',
    },
    source: { domain: 'example.com', type: 'MEDIA' },
    ...overrides,
  };
}

describe('ArticleLightAnalysisV1', () => {
  it('is stable for identical inputs', () => {
    const input = {
      articleSources: [relation()],
      factCheckData: null,
      contentHash: 'hash',
      factCheckStatus: 'COMPLETED',
      analyzedAt,
    };

    expect(buildArticleLightAnalysis(input)).toEqual(buildArticleLightAnalysis(input));
  });

  it('returns strong with HIGH confidence for three profiled domains and primary evidence', () => {
    const result = buildArticleLightAnalysis({
      articleSources: [
        relation({ role: 'PRIMARY_EVIDENCE' }),
        relation({ sourceId: 'source-2', sourceUrl: 'https://second.test/report', source: { domain: 'second.test', type: 'ACADEMIC' } }),
        relation({ sourceId: 'source-3', sourceUrl: 'https://third.test/report', source: { domain: 'third.test', type: 'GOVERNMENT' } }),
      ],
      analyzedAt,
    });

    expect(result.supportLevel).toBe('strong');
    expect(result.analysisConfidence).toBe('HIGH');
    expect(result.sourceQualitySummary).toMatchObject({ uniqueDomains: 3, profileCoverage: 1 });
    expect(result.supportLevel).not.toBe('very_strong');
    expect(result).not.toHaveProperty('score');
  });

  it('returns nuanced for two usable domains with partial profile coverage', () => {
    const result = buildArticleLightAnalysis({
      articleSources: [
        relation({ role: 'PRIMARY_EVIDENCE' }),
        relation({
          sourceId: 'source-2',
          sourceUrl: 'https://second.test/report',
          profileSnapshot: null,
          source: { domain: 'second.test', type: 'MEDIA', profileData: null },
        }),
      ],
      analyzedAt,
    });

    expect(result.supportLevel).toBe('nuanced');
    expect(result.sourceQualitySummary.uniqueDomains).toBe(2);
    expect(result.sourceQualitySummary.profileCoverage).toBe(0.5);
  });

  it('returns fragile and requires deep analysis for one source', () => {
    const result = buildArticleLightAnalysis({ articleSources: [relation()], analyzedAt });

    expect(result.supportLevel).toBe('fragile');
    expect(result.requiresDeepAnalysis).toBe(true);
    expect(result.deepAnalysisReasons).toContain('INSUFFICIENT_SOURCES');
    expect(result.deepAnalysisReasons).toContain('LOW_DOMAIN_DIVERSITY');
  });

  it('returns unverified and requires deep analysis without usable sources', () => {
    const result = buildArticleLightAnalysis({ articleSources: [], factCheckData: null, analyzedAt });

    expect(result.supportLevel).toBe('unverified');
    expect(result.analysisConfidence).toBe('LOW');
    expect(result.requiresDeepAnalysis).toBe(true);
  });

  it('flags an unknown legacy source without inventing its role', () => {
    const result = buildArticleLightAnalysis({
      factCheckData: { sources: [{ url: 'https://unknown.test/report', domain: 'unknown.test' }] },
      analyzedAt,
    });

    expect(result.deepAnalysisReasons).toContain('UNKNOWN_SOURCE');
    expect(result.sourceUsageSummary.unknownRoleCount).toBe(1);
    expect(result.sourceUsageSummary.primaryEvidenceCount).toBe(0);
  });

  it('flags metadata-only and unavailable extraction states', () => {
    const result = buildArticleLightAnalysis({
      factCheckData: {
        sources: [
          { url: 'https://one.test/a', domain: 'one.test', type: 'MEDIA', extractionStatus: 'metadata_only' },
          { url: 'https://two.test/b', domain: 'two.test', type: 'MEDIA', extractionStatus: 'failed' },
        ],
      },
      analyzedAt,
    });

    expect(result.sourceQualitySummary).toMatchObject({ metadataOnlyCount: 1, unavailableCount: 1 });
    expect(result.limitations).toContain('INCOMPLETE_SOURCE_EXTRACTION');
    expect(result.deepAnalysisReasons).toContain('INCOMPLETE_EXTRACTION');
  });

  it('uses the historical snapshot before a weaker current profile', () => {
    const result = buildArticleLightAnalysis({
      articleSources: [relation({
        currentProfile: {
          profileData: null,
          profileConfidence: 'LOW',
          publicTrustLabel: 'unverified',
        },
      })],
      analyzedAt,
    });

    expect(result.sourceQualitySummary.profiledSourceCount).toBe(1);
    expect(result.uncertainties).not.toContain('PROFILE_COVERAGE_PARTIAL');
  });

  it('falls back to legacy factCheckData sources and tolerates malformed JSON', () => {
    const legacy = buildArticleLightAnalysis({
      factCheckData: {
        sources: [
          { url: 'https://one.test/a', domain: 'one.test', type: 'MEDIA', profileData: { description: 'One' } },
          { url: 'https://two.test/b', domain: 'two.test', type: 'ACADEMIC', profileData: { description: 'Two' } },
        ],
      },
      analyzedAt,
    });
    const malformed = buildArticleLightAnalysis({ factCheckData: 'not-json', analyzedAt });

    expect(legacy.sourceQualitySummary.totalSources).toBe(2);
    expect(legacy.sourceUsageSummary.unknownRoleCount).toBe(2);
    expect(malformed.supportLevel).toBe('unverified');
    expect(malformed.requiresDeepAnalysis).toBe(true);
  });
});
