// FrontEnd/src/lib/csrf.ts
import { API_BASE } from '@/config/api';

let cachedToken: string | null = null;
let inflight: Promise<string> | null = null;

export async function getCsrfToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  if (!inflight) {
    inflight = (async () => {
      const res = await fetch(`${API_BASE}/api/csrf`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch CSRF token (HTTP ${res.status})`);
      }
      const data = await res.json();
      cachedToken = data.token;
      return cachedToken!;
    })();
  }

  return inflight;
}

/**
 * Petit helper pour construire les options fetch avec CSRF + credentials.
 */
export async function withCsrf(init: RequestInit = {}): Promise<RequestInit> {
  const token = await getCsrfToken();
  return {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.headers || {}),
      'X-CSRF-Token': token,
    },
  };
}
