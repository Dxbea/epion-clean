import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DataComplianceSection from './DataComplianceSection';

const navigateMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());
const logoutMock = vi.hoisted(() => vi.fn(async () => undefined));
const apiDeleteAccountMock = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/api/auth', () => ({
  apiDeleteAccount: apiDeleteAccountMock,
}));

vi.mock('@/contexts/MeContext', () => ({
  useMe: () => ({
    me: { id: 'user-1', email: 'user@example.com' },
    logout: logoutMock,
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ push: pushMock }),
}));

vi.mock('@/i18n/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      data: 'Data',
      data_desc: 'Data controls',
      export_json: 'Export my data',
      delete_account: 'Delete my account',
      delete_confirm_server: 'Really delete?',
      delete_confirm_email_prompt: 'Email?',
      delete_password_prompt: 'Password?',
      account_deleted: 'Account deleted.',
      delete_account_failed: 'Account deletion failed.',
      delete_account_oauth_blocked: 'OAuth deletion requires email token.',
    }[key] ?? key),
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderSection() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<DataComplianceSection />);
  });
}

function buttonByText(text: string) {
  return [...container!.querySelectorAll('button')].find((button) => button.textContent?.includes(text)) as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('account', JSON.stringify({ email: 'user@example.com' }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'prompt')
    .mockReturnValueOnce('user@example.com')
    .mockReturnValueOnce('secret-password');
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
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('DataComplianceSection account deletion', () => {
  it('deletes through the server, clears local state, logs out, and redirects', async () => {
    await renderSection();

    await act(async () => {
      buttonByText('Delete my account').click();
    });

    expect(apiDeleteAccountMock).toHaveBeenCalledWith({
      confirmationEmail: 'user@example.com',
      password: 'secret-password',
    });
    expect(localStorage.getItem('account')).toBeNull();
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    expect(pushMock).toHaveBeenCalledWith('Account deleted.', 'success');
  });

  it('shows a clear message when OAuth-only deletion is temporarily blocked', async () => {
    apiDeleteAccountMock.mockRejectedValueOnce(new Error('OAUTH_ACCOUNT_DELETION_REQUIRES_EMAIL_TOKEN'));
    await renderSection();

    await act(async () => {
      buttonByText('Delete my account').click();
    });

    expect(logoutMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith('OAuth deletion requires email token.', 'error');
  });
});
