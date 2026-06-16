import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import VerifyEmailBanner from './VerifyEmailBanner';

const meMock = vi.hoisted(() => ({
  value: null as null | { email: string; emailVerified: boolean },
}));

vi.mock('@/contexts/MeContext', () => ({
  useMe: () => ({ me: meMock.value }),
}));

vi.mock('@/i18n/I18nContext', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ push: vi.fn() }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderBanner() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<VerifyEmailBanner />);
  });
  return container;
}

beforeEach(() => {
  meMock.value = null;
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

describe('VerifyEmailBanner', () => {
  it('does not render for a verified user', async () => {
    meMock.value = { email: 'verified@example.com', emailVerified: true };

    const view = await renderBanner();

    expect(view.textContent).not.toContain('Verify your email');
  });
});
