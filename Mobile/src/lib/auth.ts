import { API_BASE, AUTH_CALLBACK_URL, WEB_ORIGIN, getHeaderValue, readJson } from '@/lib/api';
import type {
  AuthMeResult,
  AuthSessionResult,
  AuthSignInResult,
  AuthSignOutResult,
  AuthUser,
} from '@/types/user';

const LOGIN_URL = `${API_BASE}/api/auth/sign-in/email`;
const SESSION_URL = `${API_BASE}/api/auth/get-session`;
const LOGOUT_URL = `${API_BASE}/api/auth/sign-out`;
const ME_URL = `${API_BASE}/api/me`;

const betterAuthPostHeaders = {
  Accept: 'application/json',
  Origin: WEB_ORIGIN,
  Referer: `${WEB_ORIGIN}/`,
};

function logAuthStep(message: string, details?: unknown) {
  if (!__DEV__) return;

  if (details === undefined) {
    console.log(`[Epion Mobile Auth] ${message}`);
    return;
  }

  console.log(`[Epion Mobile Auth] ${message}`, details);
}

export function getUserFromSession(payload: unknown): AuthUser | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const directUser = record.user;

  if (directUser && typeof directUser === 'object') {
    return directUser as AuthUser;
  }

  const nestedData = record.data;
  if (nestedData && typeof nestedData === 'object') {
    const nestedRecord = nestedData as Record<string, unknown>;
    const nestedUser = nestedRecord.user;

    if (nestedUser && typeof nestedUser === 'object') {
      return nestedUser as AuthUser;
    }
  }

  return null;
}

export function getAuthUserLabel(user: AuthUser | null): string {
  if (!user) {
    return 'Aucun utilisateur connecte.';
  }

  return user.displayName ?? user.name ?? user.username ?? user.email ?? user.id ?? 'Utilisateur connecte';
}

export async function signInEmail(email: string, password: string): Promise<AuthSignInResult> {
  const response = await fetch(LOGIN_URL, {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...betterAuthPostHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      callbackURL: AUTH_CALLBACK_URL,
    }),
  });
  const data = await readJson(response);
  const setCookie = getHeaderValue(response.headers, 'set-cookie');

  logAuthStep('Login response', {
    status: response.status,
    ok: response.ok,
    hasSetCookieHeader: Boolean(setCookie),
    hasBody: Boolean(data),
  });

  const errorMessage =
    data && typeof data === 'object' && 'message' in data
      ? String((data as { message?: unknown }).message ?? '')
      : undefined;

  return {
    data,
    status: response.status,
    ok: response.ok,
    hasCookieHeader: Boolean(setCookie),
    errorMessage,
  };
}

export async function getSession(): Promise<AuthSessionResult> {
  const response = await fetch(`${SESSION_URL}?disableCookieCache=true`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-store',
    },
  });
  const data = await readJson(response);
  const setCookie = getHeaderValue(response.headers, 'set-cookie');

  logAuthStep('Session fetch', {
    status: response.status,
    hasSession: Boolean(data),
    hasSetCookieHeader: Boolean(setCookie),
  });

  return {
    data,
    status: response.status,
    hasCookieHeader: Boolean(setCookie),
  };
}

export async function getMe(): Promise<AuthMeResult> {
  const response = await fetch(`${ME_URL}?t=${Date.now()}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-store',
    },
  });
  const data = await readJson(response);

  logAuthStep('Me fetch', {
    status: response.status,
    hasUser: response.ok && Boolean(data),
  });

  return {
    data: response.ok && data && typeof data === 'object' ? (data as AuthUser) : null,
    status: response.status,
  };
}

export async function signOut(): Promise<AuthSignOutResult> {
  const response = await fetch(LOGOUT_URL, {
    method: 'POST',
    credentials: 'include',
    headers: betterAuthPostHeaders,
  });

  const data = await readJson(response);

  logAuthStep('Logout response', {
    status: response.status,
    ok: response.ok,
    hasBody: Boolean(data),
    sentOriginHeader: WEB_ORIGIN,
  });

  return {
    status: response.status,
    ok: response.ok,
  };
}
