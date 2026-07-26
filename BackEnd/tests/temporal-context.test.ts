import { describe, expect, it } from 'vitest';
import { temporalContext, temporalContextPrompt } from '../src/lib/article-generation-core/temporal-context.js';

describe('shared editorial temporal context', () => {
  it('anchors currentDate and currentYear in the configured timezone', () => {
    const context = temporalContext({
      now: new Date('2026-07-26T10:30:00.000Z'),
      timezone: 'Europe/Paris',
    });

    expect(context).toEqual({
      currentDate: '2026-07-26',
      currentYear: 2026,
      timezone: 'Europe/Paris',
    });
  });

  it('forbids a current-affairs article from centering an old event without an explicit request', () => {
    const prompt = temporalContextPrompt({
      now: new Date('2026-07-26T10:30:00.000Z'),
      timezone: 'Europe/Paris',
    });

    expect(prompt).toContain('currentDate ISO: 2026-07-26');
    expect(prompt).toContain('currentYear: 2026');
    expect(prompt).toContain('événement ancien (par exemple une édition 2023)');
    expect(prompt).toContain('sauf si la demande mentionne explicitement cet événement');
    expect(prompt).toContain('publishedAt et sourceUpdatedAt');
  });
});
