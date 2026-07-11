import { describe, expect, it } from 'vitest';
import { buildEnrichedSourceScoreEntry } from '../src/lib/source-enrichment-source.js';
import { stableSourceId } from '../src/lib/structured-article.js';

const richScore = {
  durableSourceId: 'real-source-uuid',
  globalScore: 82,
  confidenceLevel: 'HIGH',
  details: { transparency: 80, editorial: 81, semantic: 82, pluralism: 83 },
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
    politicalBias: 'UNKNOWN' as const,
    biasScore: 0,
    reliability: 'HIGH' as const,
    country: 'FR',
    type: 'MEDIA',
  },
  profileData: null,
  profileVersion: 1,
  profileConfidence: 'HIGH' as const,
  lastProfiledAt: '2026-07-11T10:00:00.000Z',
  publicTrustLabel: 'strong' as const,
};

describe('source enrichment source entry', () => {
  it('keeps the legacy sourceId while exposing the real durable Source id separately', () => {
    const url = 'https://example.com/report';
    const entry = buildEnrichedSourceScoreEntry({
      url,
      index: 2,
      domain: 'example.com',
      richScore,
      analysisStatus: 'ANALYZED',
      metadata: {
        provider: 'web',
        searchLane: 'FACTUAL',
        role: 'PRIMARY_EVIDENCE',
        provenance: 'WEB_SEARCH',
      },
    });

    expect(entry.sourceId).toBe(stableSourceId(url, 2));
    expect(entry.sourceId).not.toBe(richScore.durableSourceId);
    expect(entry.durableSourceId).toBe('real-source-uuid');
    expect(entry).toMatchObject({
      provider: 'web',
      searchLane: 'FACTUAL',
      role: 'PRIMARY_EVIDENCE',
      provenance: 'WEB_SEARCH',
    });
  });

  it('accepts an old metadata-free payload without inventing a role', () => {
    const entry = buildEnrichedSourceScoreEntry({
      url: 'https://example.com/legacy',
      index: 0,
      domain: 'example.com',
      richScore,
      analysisStatus: 'ANALYZED',
    });

    expect(entry.sourceId).toBe(stableSourceId('https://example.com/legacy', 0));
    expect(entry.role).toBeUndefined();
    expect(entry.searchLane).toBeUndefined();
    expect(entry.provenance).toBeUndefined();
  });
});
