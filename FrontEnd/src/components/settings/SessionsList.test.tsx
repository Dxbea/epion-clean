import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SessionsList from './SessionsList';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const pushMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const apiMocks = vi.hoisted(() => ({
  apiListSessions: vi.fn(),
  apiDeleteSession: vi.fn(),
  apiDeleteOtherSessions: vi.fn(),
}));

vi.mock('@/api/auth', () => apiMocks);

vi.mock('@/contexts/MeContext', () => ({
  useMe: () => ({ refresh: refreshMock }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ push: pushMock }),
}));

vi.mock('@/i18n/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      sessions: 'Active sessions',
      sessions_desc: 'Sign out other devices.',
      sessions_refresh: 'Refresh',
      revoke_all_others_btn: 'Sign out of other sessions',
      this_device: 'This device',
      last_active: 'Last active',
      revoke: 'Revoke',
      no_other_sessions: 'No other sessions.',
      revoke_all_done: 'Signed out of other sessions.',
      revoke_all_failed: 'Failed to revoke sessions.',
      sessions_refreshed: 'Sessions up to date.',
      saved: 'Saved',
    }[key] ?? key),
  }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderList() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<SessionsList />);
  });
  return container;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function buttonByText(text: string) {
  return [...container!.querySelectorAll('button')].find((button) => button.textContent?.includes(text)) as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  refreshMock.mockResolvedValue(undefined);
  apiMocks.apiListSessions.mockResolvedValue({
    sessions: [
      {
        id: 'current-session',
        createdAt: '2026-06-16T10:00:00.000Z',
        expiresAt: '2026-06-23T10:00:00.000Z',
        current: true,
      },
      {
        id: 'other-session',
        createdAt: '2026-06-16T11:00:00.000Z',
        expiresAt: '2026-06-23T11:00:00.000Z',
        current: false,
      },
    ],
  });
  apiMocks.apiDeleteSession.mockResolvedValue({ ok: true, current: false });
  apiMocks.apiDeleteOtherSessions.mockResolvedValue({ ok: true, deleted: 1 });
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

describe('SessionsList Better Auth migration', () => {
  it('lists sessions and revokes one session through the sanitized API', async () => {
    await renderList();
    await flush();

    expect(apiMocks.apiListSessions).toHaveBeenCalledTimes(1);
    expect(container!.textContent).toContain('This device');
    expect(container!.textContent).not.toContain('token');

    await act(async () => {
      buttonByText('Revoke').click();
    });

    expect(apiMocks.apiDeleteSession).toHaveBeenCalledWith('other-session');
    expect(pushMock).toHaveBeenCalledWith('Saved', 'success');
  });

  it('revokes other sessions and refreshes the list', async () => {
    await renderList();
    await flush();

    await act(async () => {
      buttonByText('Sign out of other sessions').click();
    });

    expect(apiMocks.apiDeleteOtherSessions).toHaveBeenCalledTimes(1);
    expect(apiMocks.apiListSessions).toHaveBeenCalledTimes(2);
    expect(pushMock).toHaveBeenCalledWith('Signed out of other sessions.', 'success');
  });
});
