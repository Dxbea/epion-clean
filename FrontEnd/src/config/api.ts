// src/lib/api.ts
import { frontendEnv } from './env';

export const API_BASE = frontendEnv.VITE_API_URL;

/**
 * Petit helper interne : tente de recharger /api/me quand on a un 401,
 * histoire de re-synchroniser le MeContext si besoin.
 */
async function tryRefreshMe() {
  try {
    await fetch(`${API_BASE}/api/me?t=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    // on ignore, c'est juste un best-effort
  }
}

/**
 * Appel API centralise.
 * - envoie toujours credentials
 * - leve une erreur JS si pas ok
 * - si 401 -> on tente un refresh, puis on jette une erreur UNAUTHENTICATED
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (res.ok) {
    if (res.status === 204) {
      return null as unknown as T;
    }
    return res.json() as Promise<T>;
  }

  if (res.status === 401) {
    await tryRefreshMe();
    const err: any = new Error('UNAUTHENTICATED');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  const text = await res.text().catch(() => `HTTP ${res.status}`);
  throw new Error(text || `HTTP ${res.status}`);
}
