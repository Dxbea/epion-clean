// src/lib/api.ts
export const API_BASE =
  import.meta.env.VITE_API_URL || 'http://localhost:5175';

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
    // on ignore, c’est juste un best-effort
  }
}

/**
 * Appel API centralisé.
 * - envoie toujours credentials
 * - lève une erreur JS si pas ok
 * - si 401 → on tente un refresh, puis on jette une erreur UNAUTHENTICATED
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

  // cas normal
  if (res.ok) {
    // si pas de body (204, delete, etc.)
    if (res.status === 204) {
      return null;
    }
    return res.json() as Promise<T>;
  }

  // si 401 → on tente de resync
  if (res.status === 401) {
    await tryRefreshMe();
    // on jette une erreur standardisée
    const err: any = new Error('UNAUTHENTICATED');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  // autre erreur → on remonte le message texte si dispo
  const text = await res.text().catch(() => `HTTP ${res.status}`);
  throw new Error(text || `HTTP ${res.status}`);
}
