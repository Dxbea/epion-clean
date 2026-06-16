const AUTH_ONLY_PATHS = new Set([
  '/verify-email',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
]);

const STORED_REDIRECT_KEYS = [
  'returnTo',
  'redirectTo',
  'callbackURL',
  'auth:returnTo',
  'epion:returnTo',
];

export const DEFAULT_AUTHENTICATED_DESTINATION = '/settings';

export function sanitizePostAuthRedirect(value: string | null | undefined) {
  if (!value) return DEFAULT_AUTHENTICATED_DESTINATION;

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return DEFAULT_AUTHENTICATED_DESTINATION;
    if (AUTH_ONLY_PATHS.has(url.pathname)) return DEFAULT_AUTHENTICATED_DESTINATION;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_AUTHENTICATED_DESTINATION;
  }
}

export function clearStoredAuthRedirects() {
  try {
    for (const key of STORED_REDIRECT_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable in private or embedded contexts.
  }
}
