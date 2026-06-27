import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ArticleInteractionSpace from './ArticleInteractionSpace';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

function interactionsResponse(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

async function renderInteractions(response = interactionsResponse()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

  await act(async () => {
    root?.render(<ArticleInteractionSpace articleSlug="public-article" />);
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  return container;
}

function dispatchPointer(target: Element, type: string, clientX: number) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    clientX: number;
    pointerId: number;
    pointerType: string;
    button: number;
  };
  event.clientX = clientX;
  event.pointerId = 1;
  event.pointerType = 'touch';
  event.button = 0;
  target.dispatchEvent(event);
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
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

  it('lets approximate touch drags snap the opinion slider to the nearest position', async () => {
    const view = await renderInteractions(interactionsResponse({ currentUserOpinionPosition: null }));
    const slider = view.querySelector('[data-opinion-slider]') as HTMLElement;
    const thumbBeforeDrag = view.querySelector('[data-opinion-slider-thumb]');

    expect(slider).toBeTruthy();
    expect(thumbBeforeDrag).toBeNull();

    slider.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 72,
      width: 300,
      height: 72,
      toJSON: () => ({}),
    });

    await act(async () => {
      dispatchPointer(slider, 'pointerdown', 30);
      dispatchPointer(slider, 'pointermove', 276);
    });

    const thumb = view.querySelector('[data-opinion-slider-thumb]') as HTMLElement;
    expect(thumb.style.left).toBe('92%');

    await act(async () => {
      dispatchPointer(slider, 'pointerup', 276);
    });

    expect(view.textContent).toContain('article_interactions_position_strong_b');
  });
});
