// FrontEnd/src/lib/auth.ts
// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import { API_BASE } from '@/config/api';
import { withCsrf } from '@/lib/csrf';

type Creds = { email: string; password: string };
type Signup = { email: string; password: string; displayName: string };

export async function apiMe() {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Cache-Control': 'no-store' },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function apiLogin(body: Creds) {
  const res = await fetch(
    `${API_BASE}/api/auth/login`,
    await withCsrf({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json(); // { user }
}

export async function apiSignup(body: Signup) {
  const res = await fetch(
    `${API_BASE}/api/auth/signup`,
    await withCsrf({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json(); // { user }
}

export async function apiLogout() {
  const res = await fetch(
    `${API_BASE}/api/auth/logout`,
    await withCsrf({
      method: 'POST',
    }),
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// --- Sessions API ---
export type SessionItem = {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  current: boolean;
};

export async function apiListSessions(): Promise<{ sessions: SessionItem[] }> {
  const res = await fetch(`${API_BASE}/api/auth/sessions`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function apiDeleteSession(id: string) {
  const res = await fetch(
    `${API_BASE}/api/auth/sessions/${id}`,
    await withCsrf({
      method: 'DELETE',
    }),
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function apiDeleteOtherSessions() {
  const res = await fetch(
    `${API_BASE}/api/auth/sessions/others`,
    await withCsrf({
      method: 'DELETE',
    }),
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// FIN BLOC
