import { createHash } from 'node:crypto';

const MAX_DISCOVERY_URL_LENGTH = 4096;
export const DISCOVERY_URL_CANONICALIZATION_VERSION = 1;

const TRACKING_QUERY_PARAMETERS = new Set([
  '_hsenc',
  '_hsmi',
  'dclid',
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  'msclkid',
  'oly_anon_id',
  'oly_enc_id',
  'ref',
  'ref_src',
  'ref_url',
  'spm',
  'twclid',
  'vero_id',
]);

export interface CanonicalizedDocumentUrl {
  originalUrl: string;
  canonicalUrl: string;
  canonicalUrlHash: string;
  canonicalizationVersion: number;
  domain: string;
}

export interface ResolvedCanonicalizedDocumentUrl extends CanonicalizedDocumentUrl {
  canonicalHint: string | null;
  canonicalHintAccepted: boolean;
}

export interface CanonicalHintOptions {
  allowCrossDomainCanonicalHint?: boolean;
}

export function canonicalizeDiscoveredUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;

  const originalUrl = input.trim();
  if (!originalUrl || originalUrl.length > MAX_DISCOVERY_URL_LENGTH) return null;

  try {
    const url = new URL(originalUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || url.username || url.password) return null;

    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = '';
    url.pathname = normalizePathname(url.pathname);

    const sortedParams = [...url.searchParams.entries()]
      .filter(([key]) => !isTrackingQueryParameter(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        compareCodePoints(leftKey, rightKey) || compareCodePoints(leftValue, rightValue));

    url.search = '';
    for (const [key, value] of sortedParams) {
      url.searchParams.append(key, value);
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function hashDiscoveredUrl(input: unknown): string | null {
  const canonicalUrl = canonicalizeDiscoveredUrl(input);
  if (!canonicalUrl) return null;
  return createHash('sha256').update(canonicalUrl).digest('hex');
}

export function buildCanonicalizedDocumentUrl(input: unknown): CanonicalizedDocumentUrl | null {
  if (typeof input !== 'string') return null;

  const originalUrl = input.trim();
  const canonicalUrl = canonicalizeDiscoveredUrl(originalUrl);
  if (!canonicalUrl) return null;

  const canonicalUrlHash = createHash('sha256').update(canonicalUrl).digest('hex');
  const domain = new URL(canonicalUrl).hostname.replace(/^www\./, '').toLowerCase();

  return {
    originalUrl,
    canonicalUrl,
    canonicalUrlHash,
    canonicalizationVersion: DISCOVERY_URL_CANONICALIZATION_VERSION,
    domain,
  };
}

export function resolveCanonicalizedDocumentUrl(
  input: unknown,
  canonicalHint: unknown,
  options: CanonicalHintOptions = {},
): ResolvedCanonicalizedDocumentUrl | null {
  const discoveredIdentity = buildCanonicalizedDocumentUrl(input);
  if (!discoveredIdentity) return null;

  const hintedIdentity = buildCanonicalizedDocumentUrl(canonicalHint);
  const canonicalHintAccepted = Boolean(
    hintedIdentity && (
      options.allowCrossDomainCanonicalHint === true ||
      hintedIdentity.domain === discoveredIdentity.domain
    ),
  );
  const resolvedIdentity = canonicalHintAccepted ? hintedIdentity! : discoveredIdentity;

  return {
    ...resolvedIdentity,
    originalUrl: discoveredIdentity.originalUrl,
    canonicalHint: hintedIdentity?.canonicalUrl ?? null,
    canonicalHintAccepted,
  };
}

function compareCodePoints(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function isTrackingQueryParameter(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized.startsWith('utm_') || TRACKING_QUERY_PARAMETERS.has(normalized);
}

function normalizePathname(pathname: string): string {
  const withoutDuplicateSlashes = pathname.replace(/\/{2,}/g, '/');
  if (withoutDuplicateSlashes.length <= 1) return '/';
  return withoutDuplicateSlashes.replace(/\/+$/, '');
}
