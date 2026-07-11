import { describe, expect, it, vi } from 'vitest';
import {
  buildSourceProfileDataFromTrustScore,
  derivePublicTrustLabelFromTrustScore,
  hydrateSourcesWithProfiles,
  mergeSourceProfileData,
  normalizeSourceProfileData,
  sanitizeSourceProfileData,
} from '../src/lib/source-profile.js';

describe('source-profile', () => {
  it('builds a public profile without technical score fields', () => {
    const profile = buildSourceProfileDataFromTrustScore({
      metadata: {
        description: 'Description publique.',
        country: 'FR',
        type: 'MEDIA',
      },
    });

    expect(profile).toMatchObject({
      description: 'Description publique.',
      country: 'FR',
      type: 'Média',
      methodVersion: 'source-profile-v1',
    });
    expect(profile).not.toHaveProperty('trustScore');
    expect(profile).not.toHaveProperty('reliability');
  });

  it('maps scores to stable public trust label keys', () => {
    expect(derivePublicTrustLabelFromTrustScore(95)).toBe('very_strong');
    expect(derivePublicTrustLabelFromTrustScore(75)).toBe('strong');
    expect(derivePublicTrustLabelFromTrustScore(55)).toBe('nuanced');
    expect(derivePublicTrustLabelFromTrustScore(35)).toBe('fragile');
    expect(derivePublicTrustLabelFromTrustScore(10)).toBe('unverified');
    expect(derivePublicTrustLabelFromTrustScore(null)).toBe('unsourced');
  });

  it('sanitizes raw technical values and ignores unsupported fields', () => {
    const profile = sanitizeSourceProfileData({
      type: 'COMMERCIAL',
      country: 'UNKNOWN',
      description: '  Profil utile.  ',
      trustScore: 91,
      reliability: 'HIGH',
      strengths: ['Transparence documentée'],
      externalReferences: [{ name: 'Référence', href: 'https://example.com/reference' }],
    });

    expect(profile).toMatchObject({
      description: 'Profil utile.',
      type: 'Commercial',
      strengths: ['Transparence documentée'],
      externalReferences: [{ label: 'Référence', url: 'https://example.com/reference' }],
    });
    expect(profile).not.toHaveProperty('trustScore');
    expect(profile).not.toHaveProperty('reliability');
    expect(profile).not.toHaveProperty('country');
    expect(JSON.stringify(profile)).not.toContain('COMMERCIAL');
  });

  it('does not invent a country when none is provided', () => {
    const profile = buildSourceProfileDataFromTrustScore({
      metadata: { description: 'Sans pays.', type: 'MEDIA' },
    });

    expect(profile).toMatchObject({ description: 'Sans pays.', type: 'Média' });
    expect(profile).not.toHaveProperty('country');
  });

  it('preserves richer existing profile data when the new profile is poorer', () => {
    const existing = normalizeSourceProfileData({
      description: 'Description existante.',
      type: 'Média',
      strengths: ['Historique éditorial documenté'],
      warnings: ['Contexte à vérifier'],
      externalReferences: [{ label: 'Notice', url: 'https://example.com/notice' }],
    });
    const candidate = normalizeSourceProfileData({ description: 'Description actualisée.', type: 'Média' });
    const merged = mergeSourceProfileData(existing, candidate);

    expect(merged).toMatchObject({
      description: 'Description actualisée.',
      strengths: ['Historique éditorial documenté'],
      warnings: ['Contexte à vérifier'],
      externalReferences: [{ label: 'Notice', url: 'https://example.com/notice' }],
    });
  });

  it('hydrates a poor chat source snapshot from one durable profile lookup', async () => {
    const lookup = vi.fn(async () => [{
      domain: 'example.com',
      profileData: { description: 'Profil durable', type: 'REPORT', warnings: ['Contexte requis'] },
      profileVersion: 1,
      profileConfidence: 'MEDIUM' as const,
      lastProfiledAt: new Date('2026-02-01T00:00:00.000Z'),
      publicTrustLabel: 'strong',
    }]);

    const result = await hydrateSourcesWithProfiles([
      { domain: 'WWW.Example.com', url: 'https://example.com/a', description: 'Champ legacy conservé' },
      { domain: 'example.com', url: 'https://example.com/b' },
    ], lookup);

    expect(lookup).toHaveBeenCalledOnce();
    expect(lookup).toHaveBeenCalledWith(['example.com']);
    expect(result[0]).toMatchObject({
      description: 'Champ legacy conservé',
      profileData: { description: 'Profil durable', warnings: ['Contexte requis'] },
      profileConfidence: 'MEDIUM',
      publicTrustLabel: 'strong',
    });
    expect(result[0].profileData).not.toHaveProperty('type');
    expect(JSON.stringify(result)).not.toContain('REPORT');
  });

  it('omits unreliable profile fields when neither snapshot nor DB profile is usable', async () => {
    const result = await hydrateSourcesWithProfiles(
      [{ domain: 'unknown.test', title: 'Legacy source' }],
      async () => [{
        domain: 'unknown.test',
        profileData: { type: 'UNKNOWN', country: 'UNKNOWN' },
        profileVersion: null,
        profileConfidence: null,
        lastProfiledAt: null,
        publicTrustLabel: 'UNKNOWN',
      }],
    );

    expect(result).toEqual([{ domain: 'unknown.test', title: 'Legacy source' }]);
  });
});
