import { describe, expect, it } from 'vitest';
import { editorialDraftArtifactToStructuredArticle } from '../src/lib/editorial-draft/structured-article-adapter.js';
import { stableSourceId } from '../src/lib/structured-article.js';
import { validArtifact } from './fixtures/editorial/draft.js';

describe('EditorialDraftArtifact to epion-article-v1 adapter', () => {
  it('maps sections, claims and frozen evidence to the public structured Article contract', () => {
    const article = editorialDraftArtifactToStructuredArticle(validArtifact, {
      evidence: [
        { evidenceKey: 'ev_one', url: 'https://one.example/a?utm_source=test', title: 'One', domain: 'one.example' },
        { evidenceKey: 'ev_two', url: 'https://two.example/b', title: 'Two', domain: 'two.example' },
      ],
      claimVerdicts: { claim_1: 'SUPPORTED', claim_2: 'PARTIALLY_SUPPORTED' },
    });

    expect(article).toMatchObject({
      version: 1,
      format: 'epion-article-v1',
      lead: { summary: validArtifact.summary, keyTakeaways: ['Central fact.'] },
    });
    expect(article.sections).toHaveLength(2);
    expect(article.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'claim_1',
        sectionId: 'section_1',
        support: 'strong',
        sourceIds: expect.arrayContaining([
          stableSourceId('https://one.example/a'),
          stableSourceId('https://two.example/b'),
        ]),
      }),
      expect.objectContaining({ id: 'claim_2', support: 'medium' }),
    ]));
    expect(article.sources).toEqual([
      expect.objectContaining({ id: stableSourceId('https://one.example/a'), url: 'https://one.example/a' }),
      expect.objectContaining({ id: stableSourceId('https://two.example/b'), url: 'https://two.example/b' }),
    ]);
  });

  it('remains a pure canonical adapter when no source-resolution context is supplied', () => {
    const article = editorialDraftArtifactToStructuredArticle(validArtifact);
    expect(article.format).toBe('epion-article-v1');
    expect(article.claims.every((claim) => claim.sourceIds === undefined)).toBe(true);
    expect(article.sources).toBeUndefined();
  });
});
