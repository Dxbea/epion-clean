import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ResetPassword from './ResetPassword';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const navigateMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());
const authMocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ push: pushMock }),
}));

vi.mock('@/lib/better-auth-client', () => ({
  authClient: {
    requestPasswordReset: authMocks.requestPasswordReset,
    resetPassword: authMocks.resetPassword,
  },
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderPage(url = '/reset-password') {
  window.history.pushState({}, '', url);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[url]}>
        <ResetPassword />
      </MemoryRouter>,
    );
  });

  return container;
}

function inputAt(index: number) {
  return container!.querySelectorAll('input')[index] as HTMLInputElement;
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function buttonByText(text: string) {
  return [...container!.querySelectorAll('button')].find((button) => button.textContent?.includes(text)) as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
  authMocks.resetPassword.mockResolvedValue({ data: { status: true }, error: null });
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

describe('ResetPassword Better Auth migration', () => {
  it('requests password reset with a generic success response', async () => {
    await renderPage();

    await act(async () => {
      changeInput(inputAt(0), 'User@Example.com');
    });
    await act(async () => {
      buttonByText('Send reset link').click();
    });

    expect(authMocks.requestPasswordReset).toHaveBeenCalledWith({
      email: 'user@example.com',
      redirectTo: 'http://localhost:3000/reset-password',
    });
    expect(pushMock).toHaveBeenCalledWith('If this email exists, a reset link has been generated.', 'success');
  });

  it('resets password with a valid token and redirects to login flow', async () => {
    await renderPage('/reset-password?token=valid-token');

    await act(async () => {
      changeInput(inputAt(0), 'New-password-123');
      changeInput(inputAt(1), 'New-password-123');
    });
    await act(async () => {
      buttonByText('Set new password').click();
    });

    expect(authMocks.resetPassword).toHaveBeenCalledWith({
      token: 'valid-token',
      newPassword: 'New-password-123',
    });
    expect(navigateMock).toHaveBeenCalledWith('/settings#account', { replace: true });
  });

  it('shows invalid or expired token errors from Better Auth', async () => {
    authMocks.resetPassword.mockResolvedValueOnce({
      data: null,
      error: { status: 400, message: 'Invalid token', code: 'INVALID_TOKEN' },
    });
    await renderPage('/reset-password?token=expired-token');

    await act(async () => {
      changeInput(inputAt(0), 'New-password-123');
      changeInput(inputAt(1), 'New-password-123');
    });
    await act(async () => {
      buttonByText('Set new password').click();
    });

    expect(container!.textContent).toContain('Invalid or expired link.');
  });
});
