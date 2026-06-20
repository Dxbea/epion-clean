import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ArticleAuthorPill from './ArticleAuthorPill';

vi.mock('@/i18n/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string) => ({ deleted_user: 'Utilisateur supprimé' }[key] ?? key),
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderPill(author: React.ComponentProps<typeof ArticleAuthorPill>['author']) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <ArticleAuthorPill author={author} />
      </MemoryRouter>,
    );
  });
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

describe('ArticleAuthorPill', () => {
  it('renders a deleted-user label when the author relation is null', async () => {
    await renderPill(null);

    expect(container?.textContent).toContain('Utilisateur supprimé');
    expect(container?.querySelector('a')).toBeNull();
  });
});