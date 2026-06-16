import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ChangePasswordForm from './ChangePasswordForm';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const pushMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const authMocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  requestPasswordReset: vi.fn(),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ push: pushMock }),
}));

vi.mock('@/contexts/MeContext', () => ({
  useMe: () => ({
    me: { email: 'user@example.com' },
    refresh: refreshMock,
  }),
}));

vi.mock('@/lib/better-auth-client', () => ({
  authClient: {
    changePassword: authMocks.changePassword,
    requestPasswordReset: authMocks.requestPasswordReset,
  },
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderForm() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <ChangePasswordForm />
      </MemoryRouter>,
    );
  });
  return container;
}

function inputAt(index: number) {
  return container!.querySelectorAll('input')[index] as HTMLInputElement;
}

function buttonByText(text: string) {
  return [...container!.querySelectorAll('button')].find((button) => button.textContent?.includes(text)) as HTMLButtonElement;
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function fillPasswords(current: string, next: string, confirm = next) {
  await act(async () => {
    changeInput(inputAt(0), current);
    changeInput(inputAt(1), next);
    changeInput(inputAt(2), confirm);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  refreshMock.mockResolvedValue(undefined);
  authMocks.changePassword.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  authMocks.requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
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

describe('ChangePasswordForm Better Auth migration', () => {
  it('changes password with Better Auth and revokes other sessions', async () => {
    await renderForm();
    await fillPasswords('Old-password-123', 'New-password-123');

    await act(async () => {
      buttonByText('Update password').click();
    });

    expect(authMocks.changePassword).toHaveBeenCalledWith({
      currentPassword: 'Old-password-123',
      newPassword: 'New-password-123',
      revokeOtherSessions: true,
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('Password updated', 'success');
  });

  it('shows wrong current password errors', async () => {
    authMocks.changePassword.mockResolvedValueOnce({
      data: null,
      error: { status: 400, message: 'Invalid password', code: 'INVALID_PASSWORD' },
    });
    await renderForm();
    await fillPasswords('Wrong-password-123', 'New-password-123');

    await act(async () => {
      buttonByText('Update password').click();
    });

    expect(container!.textContent).toContain('Current password is incorrect.');
  });
});
