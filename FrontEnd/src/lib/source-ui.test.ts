import { describe, expect, it } from 'vitest';
import {
  extractStructuredSourceProfile,
  formatPublicSourceType,
  formatSourceRoleLabel,
  getPublicContentIntentLabel,
  getPublicSourceTypeLabel,
  getSourceAnalysisLabel,
  isSourceAnalysisPending,
  normalizeSourceForUi,
} from './source-ui';

describe('source analysis display state', () => {
  it('uses terminal backend statuses instead of inferring pending from a missing score', () => {
    expect(isSourceAnalysisPending({ analysisStatus: 'METADATA_ONLY', trustScore: null })).toBe(false);
    expect(isSourceAnalysisPending({ analysisStatus: 'UNAVAILABLE', trustScore: null, type: 'PENDING' })).toBe(false);
    expect(isSourceAnalysisPending({ analysisStatus: 'PENDING', trustScore: 72 })).toBe(true);
  });

  it('labels metadata-only sources explicitly', () => {
    expect(getSourceAnalysisLabel({ analysisStatus: 'METADATA_ONLY' }, 'fr')).toBe('M\u00e9tadonn\u00e9es seules');
    expect(getSourceAnalysisLabel({ analysisStatus: 'METADATA_ONLY' }, 'en')).toBe('Metadata only');
  });

  it('keeps the legacy fallback only when the backend status is absent', () => {
    expect(isSourceAnalysisPending({ trustScore: null, type: 'PENDING' })).toBe(true);
    expect(isSourceAnalysisPending({ trustScore: 82, type: 'news' })).toBe(false);
  });
});

describe('normalizeSourceForUi', () => {
  it('does not invent a country or political position', () => {
    const source = normalizeSourceForUi({ name: 'example.com' }, 'Description');

    expect(source.country).toBeUndefined();
    expect(source.politicalBias).toBeUndefined();
  });

  it('does not invent a source type', () => {
    const source = normalizeSourceForUi({ name: 'example.com' }, 'Description');

    expect(source.type).toBeUndefined();
    expect(source.category).toBeUndefined();
  });
});

describe('public source wording', () => {
  it.each([
    ['COMMERCIAL', 'Source commerciale'],
    ['MEDIA', 'M\u00e9dia'],
    ['OFFICIAL', 'Source officielle'],
    ['GOVERNMENT', 'Source officielle'],
    ['SOCIAL', 'R\u00e9seau social'],
    ['ACADEMIC', 'Source acad\u00e9mique'],
  ])('maps %s to %s', (technicalType, publicLabel) => {
    expect(getPublicSourceTypeLabel(technicalType)).toBe(publicLabel);
  });

  it('omits an absent type', () => {
    expect(getPublicSourceTypeLabel(undefined)).toBeNull();
    expect(getPublicSourceTypeLabel('')).toBeNull();
  });

  it('does not expose unknown technical source types', () => {
    expect(formatPublicSourceType('UNKNOWN')).toBeNull();
    expect(formatPublicSourceType('BLOG_NETWORK')).toBeNull();
    expect(getPublicSourceTypeLabel('WEIRD_INTERNAL_TYPE')).toBeNull();
  });

  it.each([
    ['evidence', 'Source d\u2019appui'],
    ['proof', 'Source d\u2019appui'],
    ['supporting', 'Source d\u2019appui'],
    ['context', 'Source de contexte'],
    ['background', 'Source de contexte'],
    ['counterpoint', 'Source contradictoire'],
    ['opposition', 'Source contradictoire'],
    ['quote', 'Citation ou d\u00e9claration'],
    ['data', 'Donn\u00e9es ou chiffres'],
  ])('maps role %s to %s', (role, label) => {
    expect(formatSourceRoleLabel(role)).toBe(label);
  });

  it('omits absent or unknown source roles', () => {
    expect(formatSourceRoleLabel(undefined)).toBeNull();
    expect(formatSourceRoleLabel('unknown')).toBeNull();
    expect(formatSourceRoleLabel('INTERNAL_SCORING_ROLE')).toBeNull();
  });

  it('maps REPORT to a readable sentence without exposing the raw value', () => {
    expect(getPublicContentIntentLabel('REPORT')).toBe('Analyse fond\u00e9e sur le contenu de l\u2019article et ses sources.');
    expect(getPublicContentIntentLabel('REPORT')).not.toBe('REPORT');
  });

  it('does not expose unknown analysis intent values', () => {
    expect(getPublicContentIntentLabel('INTERNAL_INTENT')).toBeNull();
  });
});

describe('extractStructuredSourceProfile', () => {
  it('omits absent fields instead of inventing fallbacks', () => {
    const profile = extractStructuredSourceProfile({ name: 'example.com', type: 'BLOG_NETWORK' });

    expect(profile.countryLabel).toBeUndefined();
    expect(profile.description).toBeUndefined();
    expect(profile.typeLabel).toBeUndefined();
    expect(profile.roleLabel).toBeUndefined();
    expect(profile.strengths).toEqual([]);
    expect(profile.warnings).toEqual([]);
    expect(profile.references).toEqual([]);
  });

  it('extracts only structured source profile data already present in the payload', () => {
    const profile = extractStructuredSourceProfile({
      country: 'FR',
      type: 'MEDIA',
      description: 'Description utile. [1]',
      role: 'counterpoint',
      strengths: ['Historique editorial documente'],
      warnings: [{ text: 'Signalement a contextualiser', source: 'analysis' }],
      references: [{ title: 'Notice externe', url: 'https://example.com/notice' }],
      lastAnalyzedAt: '2026-07-10T12:00:00.000Z',
    });

    expect(profile.countryLabel).toBe('France');
    expect(profile.typeLabel).toBe('M\u00e9dia');
    expect(profile.description).toBe('Description utile.');
    expect(profile.roleLabel).toBe('Source contradictoire');
    expect(profile.strengths).toEqual(['Historique editorial documente']);
    expect(profile.warnings).toEqual(['Signalement a contextualiser']);
    expect(profile.references).toEqual([{ label: 'Notice externe', url: 'https://example.com/notice' }]);
    expect(profile.analyzedAtLabel).toBeTruthy();
  });

  it('extracts legacy profileData, supportRole, nested lists and audit dates', () => {
    const profile = extractStructuredSourceProfile({
      metadata: {
        profileData: {
          country: 'US',
          type: 'COMMERCIAL',
          description: 'Profil issu du payload existant.',
          supportRole: 'supporting',
          positiveSignals: { items: [{ label: 'Transparence editoriale documentee' }] },
          limitations: { entries: [{ reason: 'Contexte commercial a garder en tete' }] },
          externalReferences: { references: [{ name: 'Reference reputationale', href: 'https://example.com/ref' }] },
          lastAuditDate: '2026-07-09',
        },
      },
    });

    expect(profile.countryLabel).toBe('USA');
    expect(profile.typeLabel).toBe('Source commerciale');
    expect(profile.description).toBe('Profil issu du payload existant.');
    expect(profile.roleLabel).toBe('Source d\u2019appui');
    expect(profile.strengths).toEqual(['Transparence editoriale documentee']);
    expect(profile.warnings).toEqual(['Contexte commercial a garder en tete']);
    expect(profile.references).toEqual([{ label: 'Reference reputationale', url: 'https://example.com/ref' }]);
    expect(profile.analyzedAtLabel).toBeTruthy();
  });

  it('does not expose raw technical values in the public profile', () => {
    const profile = extractStructuredSourceProfile({
      country: '',
      type: 'UNKNOWN',
      role: 'REPORT',
      strengths: ['', { code: 'INTERNAL_SIGNAL' }],
      references: [{ code: 'PRIVATE_REFERENCE' }],
    });

    expect(profile.countryLabel).toBeUndefined();
    expect(profile.typeLabel).toBeUndefined();
    expect(profile.roleLabel).toBeUndefined();
    expect(profile.strengths).toEqual([]);
    expect(profile.references).toEqual([]);
  });
});
