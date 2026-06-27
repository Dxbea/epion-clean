import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ArticleInteractionSpace from './ArticleInteractionSpace';

vi.mock('@/contexts/MeContext', () => ({
  useMe: () => ({ me: null }),
}));

vi.mock('@/i18n/I18nContext', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/contexts/AuthPromptContext', () => ({
  useAuthPrompt: () => ({ requireAuth: vi.fn() }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderInteractions() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<ArticleInteractionSpace articleSlug="public-article" />);
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  return container;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({
      opinionQuestion: null,
      allowedPositions: [-1, -0.6, -0.2, 0.2, 0.6, 1],
      currentUserOpinionPosition: {
        id: 'position-id',
        selectedPosition: -1,
        lacksContext: false,
        confirmedAt: '2026-06-27T00:00:00.000Z',
        createdAt: '2026-06-27T00:00:00.000Z',
        updatedAt: '2026-06-27T00:00:00.000Z',
      },
      hasInsufficientContext: false,
      canContribute: false,
      canValidateContributions: false,
      contributions: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ));
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('ArticleInteractionSpace', () => {
  it('does not crash when the interactions response omits opinionDistribution', async () => {
    const view = await renderInteractions();

    expect(view.textContent).toContain('article_interactions_title');
  });

  it('uses zero counts when opinionDistribution counts are missing', async () => {
    const view = await renderInteractions();

    expect(view.querySelectorAll('[title="0"]').length).toBeGreaterThanOrEqual(6);
  });
});
