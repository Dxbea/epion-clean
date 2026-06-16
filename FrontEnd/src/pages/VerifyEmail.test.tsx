import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import VerifyEmail from './VerifyEmail';

const navigateMock = vi.hoisted(() => vi.fn());
const translateMock = vi.hoisted(() => vi.fn(() => ''));
const meMock = vi.hoisted(() => ({
  value: null as null | { emailVerified: boolean },
  loading: false,
  refresh: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/i18n/I18nContext', () => ({
  useI18n: () => ({ t: translateMock }),
}));

vi.mock('@/contexts/MeContext', () => ({
  useMe: () => ({
    me: meMock.value,
    loading: meMock.loading,
    refresh: meMock.refresh,
  }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderAt(path: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Routes>
      </MemoryRouter>,
    );
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  return container;
}

beforeEach(() => {
  navigateMock.mockClear();
  translateMock.mockClear();
  meMock.value = null;
  meMock.loading = false;
  meMock.refresh.mockClear();
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

describe('VerifyEmail page', () => {
  it('redirects a verified authenticated user away from /verify-email without token', async () => {
    meMock.value = { emailVerified: true };

    await renderAt('/verify-email');

    expect(navigateMock).toHaveBeenCalledWith('/settings', { replace: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a neutral state without token for unauthenticated users', async () => {
    const view = await renderAt('/verify-email');

    expect(view.textContent).toContain('Email verification');
    expect(view.textContent).not.toContain('Invalid verification link');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('handles a valid supplied token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const view = await renderAt('/verify-email?token=valid-token');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth/verify-email?token=valid-token'), {
      method: 'GET',
      credentials: 'include',
    });
    expect(meMock.refresh).toHaveBeenCalledTimes(1);
    expect(view.textContent).toContain('Email Verified!');
  });

  it('handles an invalid supplied token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'INVALID_TOKEN' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const view = await renderAt('/verify-email?token=bad-token');

    expect(view.textContent).toContain('Verification Failed');
    expect(view.textContent).toContain('Invalid or already used verification link.');
  });
});
