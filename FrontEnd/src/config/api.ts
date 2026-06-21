type ApiEnv = {
  VITE_API_URL?: string;
  PROD?: boolean;
};

function normalizeApiBase(rawValue: string, isProduction: boolean): string {
  const value = rawValue.trim();
  if (!value) {
    throw new Error('VITE_API_URL must not be empty.');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('VITE_API_URL must be a valid http(s) URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('VITE_API_URL must use http or https.');
  }

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('VITE_API_URL must be an API origin only, without path, query or hash.');
  }

  if (isProduction && parsed.protocol !== 'https:') {
    throw new Error('VITE_API_URL must use https in production.');
  }

  if (isProduction && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    throw new Error('VITE_API_URL must not point to localhost in production.');
  }

  return parsed.origin;
}

export function resolveApiBase(metaEnv: ApiEnv): string {
  const isProduction = Boolean(metaEnv.PROD);
  const configuredApiUrl = metaEnv.VITE_API_URL;

  if (!configuredApiUrl) {
    if (isProduction) {
      throw new Error('VITE_API_URL is required for production builds and runtime.');
    }
    return 'http://localhost:5175';
  }

  return normalizeApiBase(configuredApiUrl, isProduction);
}

export const API_BASE = resolveApiBase(import.meta.env);

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

  // cas normal
  if (res.ok) {
    // si pas de body (204, delete, etc.)
    if (res.status === 204) {
      return null as unknown as T;
    }
    return res.json() as Promise<T>;
  }

  // si 401 -> on tente de resync
  if (res.status === 401) {
    await tryRefreshMe();
    // on jette une erreur standardisee
    const err: any = new Error('UNAUTHENTICATED');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  // autre erreur -> on remonte le message texte si dispo
  const text = await res.text().catch(() => `HTTP ${res.status}`);
  throw new Error(text || `HTTP ${res.status}`);
}
