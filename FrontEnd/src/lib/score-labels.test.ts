import { describe, expect, it } from 'vitest';
import { getPublicSupportBadgeClass, getPublicSupportLabel } from './score-labels';

describe('getPublicSupportLabel', () => {
  it('uses the backend support level when available', () => {
    expect(getPublicSupportLabel({ supportLevel: 'strong', backendScore: null })).toBe('Solide');
  });

  it('derives a label only from a direct backend score', () => {
    expect(getPublicSupportLabel({ backendScore: 92 })).toBe('Très solide');
  });

  it('does not derive a strong label from incomplete or frontend fallback data', () => {
    expect(getPublicSupportLabel({ backendScore: null })).toBe('Appui non évalué');
    expect(getPublicSupportLabel({ backendScore: 92, status: 'RUNNING' })).toBe('Appui non évalué');
  });
});

describe('getPublicSupportBadgeClass', () => {
  it.each([
    ['very_strong', 'from-emerald-500'],
    ['strong', 'from-teal-500'],
    ['nuanced', 'from-yellow-400'],
    ['fragile', 'from-amber-500'],
    ['unverified', 'from-rose-500'],
    ['unsourced', 'from-gray-400'],
  ] as const)('uses a distinct gradient for %s', (level, expectedClass) => {
    expect(getPublicSupportBadgeClass(level)).toContain(expectedClass);
  });
});
