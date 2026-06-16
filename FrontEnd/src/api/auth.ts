// FrontEnd/src/lib/auth.ts
// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import { API_BASE } from '@/config/api';
import { authClient, getEmailVerificationCallbackURL } from '@/lib/better-auth-client';
import { clearStoredAuthRedirects } from '@/lib/auth-navigation';
import { withCsrf } from '@/lib/csrf';

type Creds = { email: string; password: string };
type Signup = { email: string; password: string; displayName: string; inviteCode?: string };

export async function apiMe() {
  const session = await authClient.getSession({
    query: {
      disableCookieCache: true,
    },
  });
  if (session.error || !session.data) return null;

  const res = await fetch(`${API_BASE}/api/me`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Cache-Control': 'no-store' },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function apiLogin(body: Creds) {
  const res = await authClient.signIn.email(body);
  if (res.error) throw new Error('HTTP ' + (res.error.status || 401));
  clearStoredAuthRedirects();
  return res.data;
}

export async function apiSignup(body: Signup) {
  const username = body.displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  const res = await authClient.signUp.email({
    email: body.email,
    password: body.password,
    name: body.displayName,
    username,
    callbackURL: getEmailVerificationCallbackURL(),
    ...(body.inviteCode ? { inviteCode: body.inviteCode } : {}),
  });
  if (res.error) throw new Error('HTTP ' + (res.error.status || 400));
  return res.data;
}

export async function apiLogout() {
  const res = await authClient.signOut();
  if (res.error) throw new Error('HTTP ' + (res.error.status || 400));
  return res.data;
}

// --- Sessions API ---
export type SessionItem = {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  lastActiveAt?: string | null;
  current: boolean;
};

export async function apiListSessions(): Promise<{ sessions: SessionItem[] }> {
  const res = await fetch(`${API_BASE}/api/me/sessions`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function apiDeleteSession(id: string) {
  const res = await fetch(
    `${API_BASE}/api/me/sessions/${id}`,
    await withCsrf({
      method: 'DELETE',
    }),
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function apiDeleteOtherSessions() {
  const res = await fetch(
    `${API_BASE}/api/me/sessions/others`,
    await withCsrf({
      method: 'DELETE',
    }),
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// FIN BLOC
