import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import StructuredArticleRenderer from './StructuredArticleRenderer';
import type { StructuredArticleContent } from '@/types/structuredArticle';

const markdownContent = `## État actuel du marché du cuivre

Premier paragraphe avec une référence [8].

### Facteurs de la hausse des prix

1. **Demande chinoise robuste** : explication [5].
2. **Réseaux électriques** : explication [2].
3. **Offre minière limitée** : explication [10].

### Perspectives d'avenir

Paragraphe de perspectives [9].

### Conclusion

Paragraphe de conclusion.`;

const structuredContent: StructuredArticleContent = {
  version: 1,
  format: 'epion-article-v1',
  lead: {
    summary: 'Introduction structurée.',
    keyTakeaways: ['Point clé conservé.'],
  },
  sections: [
    {
      id: 'facts',
      type: 'facts',
      title: 'Ce qui est établi',
      body: 'Bloc structuré conservé.',
    },
  ],
  claims: [],
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderArticle() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <StructuredArticleRenderer
        article={structuredContent}
        content={markdownContent}
        sources={[
          { id: 2, name: 'Source 2' },
          { id: 5, name: 'Source 5' },
          { id: 8, name: 'Source 8' },
          { id: 9, name: 'Source 9' },
          { id: 10, name: 'Source 10' },
        ]}
      />,
    );
  });

  return container;
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
});

describe('StructuredArticleRenderer', () => {
  it('renders the full markdown body when structured content is also present', async () => {
    const view = await renderArticle();
    const text = view.textContent || '';

    const h2Texts = Array.from(view.querySelectorAll('h2')).map((node) => node.textContent);
    const h3Texts = Array.from(view.querySelectorAll('h3')).map((node) => node.textContent);

    expect(h2Texts).toContain('État actuel du marché du cuivre');
    expect(h3Texts).toEqual([
      'Facteurs de la hausse des prix',
      "Perspectives d'avenir",
      'Conclusion',
    ]);

    expect(text).toContain('Premier paragraphe avec une référence');
    expect(text).toContain('Paragraphe de perspectives');
    expect(text).toContain('Paragraphe de conclusion.');

    const orderedItems = Array.from(view.querySelectorAll('ol > li')).map((node) => node.textContent || '');
    expect(orderedItems).toHaveLength(3);
    expect(orderedItems[0]).toContain('Demande chinoise robuste');
    expect(orderedItems[1]).toContain('Réseaux électriques');
    expect(orderedItems[2]).toContain('Offre minière limitée');

    expect(view.querySelector('strong')?.textContent).toBe('Demande chinoise robuste');

    for (const reference of ['8', '5', '2', '10', '9']) {
      expect(text).toContain(reference);
    }

    expect(text.indexOf('Point clé conservé.')).toBeLessThan(text.indexOf('État actuel du marché du cuivre'));
    expect(text.indexOf('État actuel du marché du cuivre')).toBeLessThan(text.indexOf('Ce qui est établi'));
    expect(text.indexOf('Perspectives')).toBeLessThan(text.indexOf('Conclusion'));

    expect(h2Texts.filter((heading) => heading === 'État actuel du marché du cuivre')).toHaveLength(1);
    expect((text.match(/Paragraphe de conclusion\./g) || [])).toHaveLength(1);
  });
});
