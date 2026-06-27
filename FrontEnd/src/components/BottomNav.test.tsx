import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BottomNav from './BottomNav';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/i18n/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      nav_news: 'News',
      nav_chat: 'Chat',
      account: 'Account',
      menu_settings: 'Settings',
      settings_title: 'Settings',
    }[key] ?? key),
  }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function LocationReadout() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

async function renderBottomNav(initialPath = '/news') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[initialPath]}>
        <BottomNav />
        <Routes>
          <Route path="*" element={<LocationReadout />} />
        </Routes>
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

function layoutTrack(track: HTMLElement) {
  track.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 64,
    width: 400,
    height: 64,
    toJSON: () => ({}),
  });
}

async function dragNav(view: HTMLDivElement, fromX: number, toX: number) {
  const track = view.querySelector('[data-bottom-nav-track]') as HTMLElement;
  layoutTrack(track);
  await act(async () => {
    dispatchPointer(track, 'pointerdown', fromX);
    dispatchPointer(track, 'pointermove', toX);
    dispatchPointer(track, 'pointerup', toX);
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

describe('BottomNav touch navigation', () => {
  it('keeps click navigation on every item', async () => {
    const view = await renderBottomNav('/news');

    await act(async () => {
      (view.querySelector('button[aria-label="Chat"]') as HTMLButtonElement).click();
    });
    expect(view.querySelector('[data-testid="location"]')?.textContent).toBe('/chat');

    await act(async () => {
      (view.querySelector('button[aria-label="Account"]') as HTMLButtonElement).click();
    });
    expect(view.querySelector('[data-testid="location"]')?.textContent).toBe('/account');

    await act(async () => {
      (view.querySelector('button[aria-label="Settings"]') as HTMLButtonElement).click();
    });
    expect(view.querySelector('[data-testid="location"]')?.textContent).toBe('/settings');

    await act(async () => {
      (view.querySelector('button[aria-label="News"]') as HTMLButtonElement).click();
    });
    expect(view.querySelector('[data-testid="location"]')?.textContent).toBe('/news');
  });

  it('treats movement under the drag threshold as a click', async () => {
    const view = await renderBottomNav('/news');
    const track = view.querySelector('[data-bottom-nav-track]') as HTMLElement;
    layoutTrack(track);

    await act(async () => {
      dispatchPointer(track, 'pointerdown', 50);
      dispatchPointer(track, 'pointermove', 56);
      dispatchPointer(track, 'pointerup', 56);
      (view.querySelector('button[aria-label="Chat"]') as HTMLButtonElement).click();
    });

    expect(view.querySelector('[data-testid="location"]')?.textContent).toBe('/chat');
  });

  it('drags from news to chat without snapping back to news', async () => {
    const view = await renderBottomNav('/news');
    await dragNav(view, 50, 150);

    expect(view.querySelector('[data-testid="location"]')?.textContent).toBe('/chat');
  });

  it('drags from chat to account', async () => {
    const view = await renderBottomNav('/chat');
    await dragNav(view, 150, 250);

    expect(view.querySelector('[data-testid="location"]')?.textContent).toBe('/account');
  });

  it('snaps releases between items to the nearest route', async () => {
    const view = await renderBottomNav('/news');
    await dragNav(view, 50, 210);

    expect(view.querySelector('[data-testid="location"]')?.textContent).toBe('/account');
  });

  it('drags the indicator while the route changes only on release', async () => {
    const view = await renderBottomNav('/news');
    const track = view.querySelector('[data-bottom-nav-track]') as HTMLElement;
    const indicator = view.querySelector('[data-bottom-nav-indicator]') as HTMLElement;
    layoutTrack(track);

    await act(async () => {
      dispatchPointer(track, 'pointerdown', 50);
      dispatchPointer(track, 'pointermove', 350);
    });

    expect(indicator.style.left).toContain('75%');
    expect(view.querySelector('[data-testid="location"]')?.textContent).toBe('/news');

    await act(async () => {
      dispatchPointer(track, 'pointerup', 350);
    });

    expect(view.querySelector('[data-testid="location"]')?.textContent).toBe('/settings');
  });
});
