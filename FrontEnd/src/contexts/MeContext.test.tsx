import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MeProvider, useMe, type Me } from './MeContext';

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@/lib/better-auth-client', () => ({
  authClient: {
    getSession: authMocks.getSession,
    signIn: {
      email: authMocks.signInEmail,
    },
    signUp: {
      email: authMocks.signUpEmail,
    },
    signOut: authMocks.signOut,
  },
  getEmailVerificationCallbackURL: () => 'http://localhost:5173/verify-email',
}));

type CapturedContext = ReturnType<typeof useMe>;

let capturedContext: CapturedContext | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

const profile: Me = {
  id: 'user-1',
  email: 'user@example.com',
  emailVerified: true,
  displayName: 'User Example',
  username: 'user',
  phone: null,
  avatarUrl: null,
  bannerUrl: null,
  role: 'USER',
  bio: null,
  followersCount: 0,
  followingCount: 0,
};

function Probe() {
  capturedContext = useMe();
  return null;
}

async function waitFor(check: () => boolean) {
  for (let i = 0; i < 20; i += 1) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error('Timed out waiting for condition');
}

async function renderProvider() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MeProvider>
        <Probe />
      </MeProvider>,
    );
  });

  await waitFor(() => capturedContext?.loading === false);
  return capturedContext!;
}

beforeEach(() => {
  capturedContext = null;
  vi.clearAllMocks();
  authMocks.getSession.mockResolvedValue({ data: null, error: { status: 401, message: 'Unauthorized' } });
  authMocks.signInEmail.mockResolvedValue({ data: null, error: null });
  authMocks.signUpEmail.mockResolvedValue({ data: null, error: null });
  authMocks.signOut.mockResolvedValue({ data: { success: true }, error: null });
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

describe('MeProvider Better Auth migration', () => {
  it('bootstraps as unauthenticated without fetching the Epion profile', async () => {
    const ctx = await renderProvider();

    expect(ctx.me).toBeNull();
    expect(authMocks.getSession).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bootstraps an authenticated user from Better Auth session plus /api/me', async () => {
    authMocks.getSession.mockResolvedValueOnce({
      data: { user: { id: profile.id, email: profile.email }, session: { id: 'session-1' } },
      error: null,
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(profile), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const ctx = await renderProvider();

    expect(ctx.me?.id).toBe(profile.id);
    expect(ctx.me?.role).toBe('USER');
    expect(authMocks.getSession).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/api/me');
  });

  it('logs in with Better Auth email sign-in and refreshes the current user', async () => {
    const ctx = await renderProvider();

    authMocks.signInEmail.mockResolvedValueOnce({ data: { user: { id: profile.id } }, error: null });
    authMocks.getSession.mockResolvedValueOnce({
      data: { user: { id: profile.id, email: profile.email }, session: { id: 'session-1' } },
      error: null,
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(profile), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await act(async () => {
      await ctx.login(profile.email, 'password-123');
    });

    expect(authMocks.signInEmail).toHaveBeenCalledWith({
      email: profile.email,
      password: 'password-123',
    });
    expect(capturedContext?.me?.email).toBe(profile.email);
  });

  it('clears stale auth-only redirects after successful sign-in', async () => {
    localStorage.setItem('returnTo', '/verify-email');
    sessionStorage.setItem('redirectTo', '/verify-email');
    const ctx = await renderProvider();

    authMocks.signInEmail.mockResolvedValueOnce({ data: { user: { id: profile.id } }, error: null });
    authMocks.getSession.mockResolvedValueOnce({
      data: { user: { id: profile.id, email: profile.email }, session: { id: 'session-1' } },
      error: null,
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(profile), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await act(async () => {
      await ctx.login(profile.email, 'password-123');
    });

    expect(localStorage.getItem('returnTo')).toBeNull();
    expect(sessionStorage.getItem('redirectTo')).toBeNull();
  });

  it('surfaces Better Auth login failures', async () => {
    const ctx = await renderProvider();
    authMocks.signInEmail.mockResolvedValueOnce({
      data: null,
      error: { status: 401, message: 'Invalid email or password' },
    });

    await expect(ctx.login(profile.email, 'wrong-password')).rejects.toThrow('HTTP 401');
  });

  it('surfaces unverified email sign-in separately from generic login errors', async () => {
    const ctx = await renderProvider();
    authMocks.signInEmail.mockResolvedValueOnce({
      data: null,
      error: { status: 403, message: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' },
    });

    await expect(ctx.login(profile.email, 'password-123')).rejects.toThrow('EMAIL_NOT_VERIFIED');
  });

  it('signs up with Better Auth email sign-up and preserves the beta invite code', async () => {
    const ctx = await renderProvider();

    await act(async () => {
      await ctx.signup('new@example.com', 'password-123', 'Jane Doe', 'BETA-1234');
    });

    expect(authMocks.signUpEmail).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password-123',
      name: 'Jane Doe',
      username: 'jane_doe',
      callbackURL: 'http://localhost:5173/verify-email',
      inviteCode: 'BETA-1234',
    });
  });

  it('logs out with Better Auth sign-out and clears local user state', async () => {
    authMocks.getSession.mockResolvedValueOnce({
      data: { user: { id: profile.id, email: profile.email }, session: { id: 'session-1' } },
      error: null,
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(profile), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const ctx = await renderProvider();
    expect(ctx.me).not.toBeNull();

    await act(async () => {
      await ctx.logout();
    });

    expect(authMocks.signOut).toHaveBeenCalledTimes(1);
    expect(capturedContext?.me).toBeNull();
  });
});
