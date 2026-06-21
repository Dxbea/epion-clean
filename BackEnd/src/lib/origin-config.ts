export type AppEnvironment = 'development' | 'test' | 'staging' | 'production';

export const DEV_BROWSER_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function isStrictAppEnvironment(appEnv: AppEnvironment): boolean {
  return appEnv === 'production' || appEnv === 'staging';
}

export function splitCommaSeparated(value?: string): string[] {
  if (value === undefined) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeOrigin(value: string, label = 'origin'): string {
  if (!value || value.trim() !== value) {
    throw new Error(`${label} must not be empty or padded with whitespace`);
  }

  if (value.includes('*')) {
    throw new Error(`${label} must be explicit; wildcards are not allowed`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL origin: ${value}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} must use http or https: ${value}`);
  }

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${label} must not include path, query or hash: ${value}`);
  }

  return parsed.origin;
}

export function normalizeOriginList(value: string | undefined, label: string): string[] {
  if (value !== undefined && value.trim() === '') {
    throw new Error(`${label} must not be empty when set`);
  }

  return uniqueOrigins(splitCommaSeparated(value).map((origin) => normalizeOrigin(origin, label)));
}

export function uniqueOrigins(origins: string[]): string[] {
  return Array.from(new Set(origins));
}

export function isLocalOrigin(origin: string): boolean {
  const { hostname } = new URL(origin);
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function assertHttpsPublicOrigin(origin: string, label: string): void {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:') {
    throw new Error(`${label} must use https in staging/production: ${origin}`);
  }
  if (isLocalOrigin(origin)) {
    throw new Error(`${label} must not point to localhost in staging/production: ${origin}`);
  }
}
