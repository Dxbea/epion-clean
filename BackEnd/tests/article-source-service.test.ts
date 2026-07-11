import { describe, expect, it } from 'vitest';
import {
  buildArticleSourceProfileSnapshot,
  buildArticleSourceUpsertInput,
  deriveArticleSourceRoleFromLane,
  deriveArticleSourceSupportStrength,
  hashArticleSourceUrl,
  normalizeArticleSourceUrl,
} from '../src/lib/article-source-service.js';

describe('article-source-service', () => {
  it('produces a stable hash from a normalized URL', () => {
    const first = 'HTTPS://Example.COM/article?b=2&a=1#section';
    const second = 'https://example.com/article?a=1&b=2';

    expect(normalizeArticleSourceUrl(first)).toBe('https://example.com/article?a=1&b=2');
    expect(hashArticleSourceUrl(first)).toBe(hashArticleSourceUrl(second));
  });

  it('allows two different URLs from the same domain', () => {
    const first = buildArticleSourceUpsertInput({
      articleId: 'article-1',
      durableSourceId: 'durable-source-1',
      sourceUrl: 'https://example.com/report-a',
    });
    const second = buildArticleSourceUpsertInput({
      articleId: 'article-1',
      durableSourceId: 'durable-source-1',
      sourceUrl: 'https://example.com/report-b',
    });

    expect(first?.where.articleId_sourceUrlHash.sourceUrlHash)
      .not.toBe(second?.where.articleId_sourceUrlHash.sourceUrlHash);
  });

  it('maps search lanes without inventing an official statement', () => {
    expect(deriveArticleSourceRoleFromLane('FACTUAL')).toBe('PRIMARY_EVIDENCE');
    expect(deriveArticleSourceRoleFromLane('CRITICAL')).toBe('COUNTERPOINT');
    expect(deriveArticleSourceRoleFromLane('CONTEXTUAL')).toBe('CONTEXT');
    expect(deriveArticleSourceRoleFromLane(undefined)).toBe('UNKNOWN');
    expect(deriveArticleSourceRoleFromLane('OFFICIAL')).toBe('UNKNOWN');
    expect(deriveArticleSourceRoleFromLane('FACTUAL', { explicitOfficialStatement: true }))
      .toBe('OFFICIAL_STATEMENT');
  });

  it('only accepts explicit support-strength signals', () => {
    expect(deriveArticleSourceSupportStrength('STRONG')).toBe('STRONG');
    expect(deriveArticleSourceSupportStrength('moderate')).toBe('MODERATE');
    expect(deriveArticleSourceSupportStrength(85)).toBe('UNKNOWN');
    expect(deriveArticleSourceSupportStrength(undefined)).toBe('UNKNOWN');
  });

  it('builds a profile snapshot without making trustScore a snapshot field', () => {
    const snapshot = buildArticleSourceProfileSnapshot({
      profileData: { description: 'Profil durable', type: 'Média', trustScore: 91 },
      profileConfidence: 'HIGH',
      publicTrustLabel: 'very_strong',
      lastProfiledAt: new Date('2026-07-10T10:00:00.000Z'),
      snapshotAt: new Date('2026-07-11T10:00:00.000Z'),
    });

    expect(snapshot).toEqual({
      profileData: { description: 'Profil durable', type: 'Média' },
      profileConfidence: 'HIGH',
      publicTrustLabel: 'very_strong',
      lastProfiledAt: '2026-07-10T10:00:00.000Z',
      snapshotAt: '2026-07-11T10:00:00.000Z',
    });
    expect(snapshot).not.toHaveProperty('trustScore');
  });

  it('refuses an absent durable Source id', () => {
    expect(buildArticleSourceUpsertInput({
      articleId: 'article-1',
      sourceUrl: 'https://example.com/report',
    })).toBeNull();
  });

  it('never treats a legacy sourceId as the durable Source id', () => {
    const legacyOnlyInput = {
      articleId: 'article-1',
      sourceId: 'src_legacy_hash',
      sourceUrl: 'https://example.com/report',
    } as unknown as Parameters<typeof buildArticleSourceUpsertInput>[0];

    expect(buildArticleSourceUpsertInput(legacyOnlyInput)).toBeNull();
  });

  it('uses the normalized URL hash as the article-scoped upsert key', () => {
    const first = buildArticleSourceUpsertInput({
      articleId: 'article-1',
      durableSourceId: 'durable-source-1',
      sourceUrl: 'https://example.com/report?b=2&a=1#details',
    });
    const second = buildArticleSourceUpsertInput({
      articleId: 'article-1',
      durableSourceId: 'durable-source-1',
      sourceUrl: 'https://EXAMPLE.com/report?a=1&b=2',
    });

    expect(first?.where).toEqual(second?.where);
  });

  it('can preserve an existing snapshot while still updating relationship metadata', () => {
    const upsert = buildArticleSourceUpsertInput({
      articleId: 'article-1',
      durableSourceId: 'durable-source-1',
      sourceUrl: 'https://example.com/report',
      profileSnapshot: buildArticleSourceProfileSnapshot({
        profileData: null,
        snapshotAt: '2026-07-11T10:00:00.000Z',
      }),
      profileVersion: 1,
      position: 2,
      preserveExistingSnapshot: true,
    });

    expect(upsert?.create).toMatchObject({
      profileVersion: 1,
      profileSnapshot: expect.any(Object),
    });
    expect(upsert?.update).toMatchObject({ position: 2 });
    expect(upsert?.update).not.toHaveProperty('profileSnapshot');
    expect(upsert?.update).not.toHaveProperty('profileVersion');
    expect(upsert?.update).not.toHaveProperty('snapshotAt');
  });
});
