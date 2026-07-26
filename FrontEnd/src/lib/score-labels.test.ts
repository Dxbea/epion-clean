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
    ['very_strong', 'bg-emerald-700'],
    ['strong', 'bg-teal-700'],
    ['nuanced', 'bg-amber-300'],
    ['fragile', 'bg-orange-700'],
    ['unverified', 'bg-red-700'],
    ['unsourced', 'bg-neutral-500'],
  ] as const)('uses a distinct gradient for %s', (level, expectedClass) => {
    expect(getPublicSupportBadgeClass(level)).toContain(expectedClass);
  });
});
