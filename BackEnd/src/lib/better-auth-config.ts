import { env } from '../env.js';

function splitOrigins(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

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
  return env.BETTER_AUTH_URL;
}

export function getBetterAuthTrustedOrigins(): string[] {
  return Array.from(
    new Set([
      env.FRONTEND_ORIGIN,
      ...splitOrigins(env.BETTER_AUTH_TRUSTED_ORIGINS),
    ].map(validateOrigin)),
  );
}

export function getBetterAuthSecret(): string {
  return env.BETTER_AUTH_SECRET;
}
