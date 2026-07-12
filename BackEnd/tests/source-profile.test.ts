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
      profileSummary: 'Description publique.',
      sourceFacts: { country: 'FR', type: 'Média' },
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
      claimReferences: { 'editorialReputation.reliabilitySignals': ['ref_1'] },
    });

    expect(profile).toMatchObject({
      description: 'Profil utile.',
      sourceFacts: { type: 'Commercial' },
      editorialReputation: { reliabilitySignals: ['Transparence documentée'] },
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

    expect(profile).toMatchObject({ description: 'Sans pays.', sourceFacts: { type: 'Média' } });
    expect(profile?.sourceFacts).not.toHaveProperty('country');
  });

  it('preserves richer existing profile data when the new profile is poorer', () => {
    const existing = normalizeSourceProfileData({
      description: 'Description existante.',
      type: 'Média',
      editorialReputation: { reliabilitySignals: ['Historique éditorial documenté'] },
      vigilancePoints: ['Contexte à vérifier'],
      externalReferences: [{ label: 'Notice', url: 'https://example.com/notice' }],
      claimReferences: { 'editorialReputation.reliabilitySignals': ['ref_1'] },
    });
    const candidate = normalizeSourceProfileData({ description: 'Description actualisée.', type: 'Média' });
    const merged = mergeSourceProfileData(existing, candidate);

    expect(merged).toMatchObject({
      description: 'Description actualisée.',
      editorialReputation: { reliabilitySignals: ['Historique éditorial documenté'] },
      vigilancePoints: ['Contexte à vérifier'],
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
      profileData: { description: 'Profil durable', profileSummary: 'Profil durable', vigilancePoints: ['Contexte requis'] },
      profileConfidence: 'MEDIUM',
      publicTrustLabel: 'strong',
    });
    expect(result[0].profileData).not.toHaveProperty('type');
    expect(JSON.stringify(result)).not.toContain('REPORT');
  });

  it('adds only a clearly labelled type limitation when no documented vigilance point exists', () => {
    const profile = buildSourceProfileDataFromTrustScore({
      domain: 'example.com',
      metadata: { description: 'Média généraliste.', type: 'MEDIA' },
    });

    expect(profile?.vigilancePoints).toEqual([
      expect.stringContaining('Limite liée au type :'),
    ]);
    expect(profile?.editorialReputation).toBeUndefined();
  });

  it('keeps documented strengths, vigilance points and profile references', () => {
    const profile = buildSourceProfileDataFromTrustScore({
      domain: 'example.com',
      metadata: { description: 'Profil documenté.', type: 'MEDIA' },
      profileSummary: 'Média national documenté par les références.',
      ownership: 'Groupe Exemple',
      businessModel: 'Abonnements et publicité',
      specialty: 'Actualité nationale',
      editorialPositioning: 'Ligne éditoriale généraliste',
      strengths: ['Charte éditoriale publiée'],
      vigilancePoints: ['Rectificatif relevé dans la référence'],
      externalReferences: [{ label: 'Notice indépendante', url: 'https://example.org/notice' }],
      claimReferences: {
        'editorialReputation.editorialPositioning': ['ref_1'],
        'editorialReputation.reliabilitySignals': ['ref_1'],
        vigilancePoints: ['ref_1'],
      },
    });
    expect(profile?.editorialReputation?.reliabilitySignals).not.toContain('Abonnements et publicité');
    expect(profile).not.toHaveProperty('strengths');

    expect(profile).toMatchObject({
      profileSummary: 'Média national documenté par les références.',
      sourceFacts: {
        ownership: 'Groupe Exemple',
        businessModel: 'Abonnements et publicité',
        specialty: 'Actualité nationale',
      },
      editorialReputation: {
        editorialPositioning: 'Ligne éditoriale généraliste',
        reliabilitySignals: ['Charte éditoriale publiée'],
      },
      vigilancePoints: ['Rectificatif relevé dans la référence'],
      externalReferences: [{ label: 'Notice indépendante', url: 'https://example.org/notice' }],
    });
  });

  it('keeps a documented institutional mandate and institutional limitation', () => {
    const profile = buildSourceProfileDataFromTrustScore({
      domain: 'institution.example',
      metadata: { description: 'Institution publique.', type: 'GOVERNMENT' },
      profileSummary: 'Institution chargée par la loi de publier les statistiques nationales.',
      specialty: 'Statistiques publiques',
      vigilancePoints: ['Sa communication présente le point de vue de l’institution et ne constitue pas une évaluation indépendante.'],
      externalReferences: [{ label: 'Mandat légal', url: 'https://institution.example/mandat' }],
    });

    expect(profile).toMatchObject({
      profileSummary: 'Institution chargée par la loi de publier les statistiques nationales.',
      sourceFacts: { specialty: 'Statistiques publiques' },
      vigilancePoints: ['Sa communication présente le point de vue de l’institution et ne constitue pas une évaluation indépendante.'],
    });
  });

  it('does not keep strong specific claims without an external reference', () => {
    const profile = buildSourceProfileDataFromTrustScore({
      domain: 'media.example',
      metadata: { description: 'Média généraliste.', type: 'MEDIA' },
      ownership: 'Propriétaire non vérifié',
      businessModel: 'Modèle supposé',
      strengths: ['Qualité non sourcée'],
      vigilancePoints: ['Critique non sourcée'],
      externalReferences: [],
    });

    expect(profile?.sourceFacts).not.toHaveProperty('ownership');
    expect(profile?.sourceFacts).not.toHaveProperty('businessModel');
    expect(profile?.editorialReputation).toBeUndefined();
    expect(profile?.vigilancePoints).toEqual([expect.stringContaining('Limite liée au type :')]);
  });

  it('removes misinformation and editorial positioning without claim evidence', () => {
    const profile = sanitizeSourceProfileData({
      profileSummary: 'Ancien profil encore lisible.',
      editorialReputation: {
        editorialPositioning: 'Orientation politique affirmée.',
        misinformationSignals: ['Accusation de désinformation non sourcée.'],
      },
      externalReferences: [{ id: 'ref_1', label: 'Notice générale', url: 'https://example.org/notice' }],
    });

    expect(profile?.profileSummary).toBe('Ancien profil encore lisible.');
    expect(profile?.editorialReputation).toBeUndefined();
  });

  it('keeps correction policy and controversy when linked to valid references', () => {
    const profile = sanitizeSourceProfileData({
      editorialReputation: { editorialPolicy: 'Politique de correction publiée.' },
      vigilancePoints: ['Controverse documentée par un observatoire indépendant.'],
      externalReferences: [{
        id: 'ref_policy',
        label: 'Charte et notice',
        url: 'https://example.org/charte',
        publisher: 'Observatoire Exemple',
        referenceType: 'Notice indépendante',
      }],
      claimReferences: {
        'editorialReputation.editorialPolicy': ['ref_policy'],
        vigilancePoints: ['ref_policy'],
      },
    });

    expect(profile?.editorialReputation?.editorialPolicy).toBe('Politique de correction publiée.');
    expect(profile?.vigilancePoints).toEqual(['Controverse documentée par un observatoire indépendant.']);
    expect(profile?.externalReferences).toEqual([{
      id: 'ref_policy',
      label: 'Charte et notice',
      url: 'https://example.org/charte',
      publisher: 'Observatoire Exemple',
      referenceType: 'Notice indépendante',
    }]);
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
