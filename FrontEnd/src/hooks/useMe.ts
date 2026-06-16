// src/hooks/useMe.ts
import * as React from 'react';
import { API_BASE } from '@/config/api';
import { authClient, getEmailVerificationCallbackURL } from '@/lib/better-auth-client';
import { clearStoredAuthRedirects } from '@/lib/auth-navigation';

export type Me = {
  id: string
  email: string
  emailVerified: boolean
  emailVerifiedAt: string | null
  displayName: string
  username: string
  phone: string | null
  avatarUrl: string | null
  role: string
} | null

export function useMe() {
  const [me, setMe] = React.useState<Me | null>(null);
  const [loading, setLoading] = React.useState(true);

  // --- factorise le fetch pour pouvoir le réutiliser (refresh) ---
  const refresh = React.useCallback(async () => {
    try {
      setLoading(true);
      const session = await authClient.getSession({ query: { disableCookieCache: true } });
      if (session.error || !session.data) throw new Error('UNAUTHENTICATED');
      const url = `${API_BASE}/api/me?t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store', credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Me;
      setMe(json);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  // --- auth actions (gardent ton flux actuel) ---
  async function login(email: string, password: string) {
    const res = await authClient.signIn.email({ email, password });
    if (res.error) {
      const code = String(res.error.message || '');
      if (res.error.status === 403 || code.includes('EMAIL_NOT_VERIFIED') || code.includes('Email not verified')) {
        throw new Error('EMAIL_NOT_VERIFIED');
      }
      throw new Error(res.error.message || `HTTP ${res.error.status || 401}`);
    }
    await refresh(); // <- s’assure d’avoir la forme /auth/me
    clearStoredAuthRedirects();
  }

  async function signup(email: string, password: string, displayName: string, inviteCode?: string) {
    const username = displayName.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
    const res = await authClient.signUp.email({
      email,
      password,
      name: displayName,
      username,
      callbackURL: getEmailVerificationCallbackURL(),
      ...(inviteCode ? { inviteCode } : {}),
    });
    if (res.error) {
      throw new Error(res.error.message || `HTTP ${res.error.status || 400}`);
    }
    await refresh();
  }

  async function logout() {
    await authClient.signOut()
      .catch(() => {});
    setMe(null);
  }

  // Option pratique pour MAJ optimiste locale (ex: après PUT /api/me)
  function setLocal(patch: Partial<Me>) {
    setMe((m) => (m ? { ...m, ...patch } : m));
  }

  return { me, loading, login, signup, logout, refresh, setLocal };
}
