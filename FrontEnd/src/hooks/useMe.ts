// src/hooks/useMe.ts
import * as React from 'react';
import { API_BASE } from '@/config/api';

export type Me = {
  id: string
  email: string
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
      const url = `${API_BASE}/api/auth/me?t=${Date.now()}`;
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
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(text || `HTTP ${res.status}`);
    }
    await refresh(); // <- s’assure d’avoir la forme /auth/me
  }

  async function signup(email: string, password: string, displayName: string) {
    const res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(text || `HTTP ${res.status}`);
    }
    await refresh();
  }

  async function logout() {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' })
      .catch(() => {});
    setMe(null);
  }

  // Option pratique pour MAJ optimiste locale (ex: après PUT /api/me)
  function setLocal(patch: Partial<Me>) {
    setMe((m) => (m ? { ...m, ...patch } : m));
  }

  return { me, loading, login, signup, logout, refresh, setLocal };
}
