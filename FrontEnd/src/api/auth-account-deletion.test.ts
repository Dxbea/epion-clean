import { beforeEach, describe, expect, it, vi } from 'vitest';

const csrfMock = vi.hoisted(() => vi.fn(async (init: RequestInit = {}) => ({
  ...init,
  credentials: 'include',
  headers: {
    ...(init.headers as Record<string, string> | undefined),
    'x-csrf-token': 'csrf-token',
  },
})));

vi.mock('@/lib/csrf', () => ({ withCsrf: csrfMock }));
vi.mock('@/lib/better-auth-client', () => ({
  authClient: {
    getSession: vi.fn(),
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  },
  getEmailVerificationCallbackURL: () => 'http://localhost:5173/verify-email',
}));

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as any;
});

describe('account deletion API', () => {
  it('sends account deletion through CSRF-protected DELETE', async () => {
    const { apiDeleteAccount } = await import('./auth');

    await apiDeleteAccount({ confirmationEmail: 'user@example.com', password: 'secret' });

    expect(csrfMock).toHaveBeenCalledWith(expect.objectContaining({ method: 'DELETE' }));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/me/account'),
      expect.objectContaining({
        method: 'DELETE',
        credentials: 'include',
        headers: expect.objectContaining({ 'x-csrf-token': 'csrf-token' }),
        body: JSON.stringify({ confirmationEmail: 'user@example.com', password: 'secret' }),
      }),
    );
  });
});
