import { env } from '../env.js';
import { getAllowedBrowserOrigins } from './security-config.js';

const DEFAULT_BACKEND_ORIGIN = `http://localhost:${env.PORT}`;

function validateOrigin(origin: string): string {
  let parsed: URL;

  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`Invalid Better Auth trusted origin: ${origin}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Better Auth trusted origin must use http or https: ${origin}`);
  }

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`Better Auth trusted origin must not include path, query or hash: ${origin}`);
  }

  return parsed.origin;
}

export function getBetterAuthBaseUrl(): string {
  return env.BETTER_AUTH_URL ?? DEFAULT_BACKEND_ORIGIN;
}

export function getBetterAuthTrustedOrigins(): string[] {
  return Array.from(new Set(getAllowedBrowserOrigins().map(validateOrigin)));
}

export function getBetterAuthSecret(): string {
  const secret = env.BETTER_AUTH_SECRET;

  if (secret) {
    if (env.NODE_ENV === 'production' && secret.startsWith('replace_me')) {
      throw new Error('BETTER_AUTH_SECRET must be a real secret in production.');
    }

    return secret;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_SECRET must be set in production.');
  }

  return 'dev-better-auth-secret-change-me-32-chars-min';
}
