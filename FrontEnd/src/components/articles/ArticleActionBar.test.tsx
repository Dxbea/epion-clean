import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ArticleActionBar from './ArticleActionBar';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/i18n/I18nContext', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string) => ({ nav_news: 'News' }[key] ?? key),
  }),
}));

vi.mock('@/components/ui/ReactionButtons', () => ({
  default: () => <div data-testid="reactions">Reactions panel</div>,
}));

vi.mock('@/components/ui/SaveButton', () => ({
  default: () => <button type="button">Save article</button>,
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const onChat = vi.fn();
const onShowPrompt = vi.fn();
const onHighlightClick = vi.fn();

async function renderToolbar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MemoryRouter>
        <ArticleActionBar
          articleId="article-1"
          onChat={onChat}
          onFactCheck={vi.fn()}
          onShowPrompt={onShowPrompt}
          promptText="prompt context"
          onHighlightClick={onHighlightClick}
        />
      </MemoryRouter>,
    );
  });

  return container;
}

function dispatchPointer(target: Element, type: string, clientX: number, pointerId = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    clientX: number;
    pointerId: number;
    pointerType: string;
    button: number;
  };
  event.clientX = clientX;
  event.pointerId = pointerId;
  event.pointerType = 'touch';
  event.button = 0;
  target.dispatchEvent(event);
}

function layoutActions(track: HTMLElement) {
  track.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 250,
    bottom: 40,
    width: 250,
    height: 40,
    toJSON: () => ({}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
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
});

describe('ArticleActionBar actions', () => {
  it('keeps click behavior for share and interactions panels', async () => {
    const view = await renderToolbar();

    await act(async () => {
      (view.querySelector('button[aria-label="Share"]') as HTMLButtonElement).click();
    });
    expect(view.textContent).toContain('Share');

    await act(async () => {
      (view.querySelector('button[title="Interact"]') as HTMLButtonElement).click();
    });
    expect(view.querySelector('[data-testid="reactions"]')).toBeTruthy();
  });

  it('keeps click behavior for chat, highlight, and info', async () => {
    const view = await renderToolbar();

    await act(async () => {
      (view.querySelector('button[title="Chat with article"]') as HTMLButtonElement).click();
    });
    expect(onChat).toHaveBeenCalledTimes(1);

    await act(async () => {
      (view.querySelector('button[title="Surligner"]') as HTMLButtonElement).click();
    });
    expect(onHighlightClick).toHaveBeenCalledTimes(1);

    await act(async () => {
      (view.querySelector('button[title="Analysis Info"]') as HTMLButtonElement).click();
    });
    expect(onShowPrompt).toHaveBeenCalledTimes(1);
    expect(view.textContent).toContain('prompt context');
  });

  it('treats movement under the drag threshold as a click', async () => {
    const view = await renderToolbar();
    const track = view.querySelector('[data-article-toolbar-actions]') as HTMLElement;
    layoutActions(track);

    await act(async () => {
      dispatchPointer(track, 'pointerdown', 25);
      dispatchPointer(track, 'pointermove', 31);
      dispatchPointer(track, 'pointerup', 31);
      (view.querySelector('button[aria-label="Share"]') as HTMLButtonElement).click();
    });

    expect(view.textContent).toContain('Share');
  });

  it('drags and snaps to the nearest toolbar action', async () => {
    const view = await renderToolbar();
    const track = view.querySelector('[data-article-toolbar-actions]') as HTMLElement;
    layoutActions(track);

    await act(async () => {
      dispatchPointer(track, 'pointerdown', 25);
      dispatchPointer(track, 'pointermove', 225);
    });

    const indicator = view.querySelector('[data-article-toolbar-indicator]') as HTMLElement;
    expect(indicator.style.left).toContain('80%');
    expect(onShowPrompt).not.toHaveBeenCalled();

    await act(async () => {
      dispatchPointer(track, 'pointerup', 225);
    });

    expect(onShowPrompt).toHaveBeenCalledTimes(1);
    expect(view.textContent).toContain('prompt context');
  });

  it('dragging to chat triggers chat without requiring a click', async () => {
    const view = await renderToolbar();
    const track = view.querySelector('[data-article-toolbar-actions]') as HTMLElement;
    layoutActions(track);

    await act(async () => {
      dispatchPointer(track, 'pointerdown', 25);
      dispatchPointer(track, 'pointermove', 125);
      dispatchPointer(track, 'pointerup', 125);
    });

    expect(onChat).toHaveBeenCalledTimes(1);
  });
});
