import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

const TRACKING_QUERY_PARAMETERS = new Set([
  'fbclid', 'gclid', 'msclkid', 'ref', 'ref_src', 'igshid', 'mc_cid', 'mc_eid',
]);

export type ArticleSourceRoleValue =
  | 'PRIMARY_EVIDENCE'
  | 'CONTEXT'
  | 'COUNTERPOINT'
  | 'OFFICIAL_STATEMENT'
  | 'BACKGROUND'
  | 'UNKNOWN';

export type ArticleSourceSupportStrengthValue = 'STRONG' | 'MODERATE' | 'WEAK' | 'UNKNOWN';

export type ArticleSourceProvenanceValue =
  | 'WEB_SEARCH'
  | 'INTERNAL_RAG'
  | 'USER_PROVIDED'
  | 'EDITORIAL'
  | 'IMPORTED_LEGACY'
  | 'UNKNOWN';

export interface ArticleSourceProfileSnapshot {
  profileData: unknown | null;
  profileConfidence: string | null;
  publicTrustLabel: string | null;
  lastProfiledAt: string | null;
  snapshotAt: string;
  sourceMetadata?: {
    domain: string | null;
    name: string | null;
    trustScore: number | null;
    reliability: string | null;
    profileVersion: number | null;
  };
  platformContext?: PlatformArticleContext;
}

export type PlatformActorType = 'CHANNEL' | 'ACCOUNT' | 'COMMUNITY';

export interface PlatformArticleContext {
  platform: string;
  actorName?: string;
  handle?: string;
  actorUrl?: string;
  actorType?: PlatformActorType;
  actorDescription?: string;
  contentTitle?: string;
  contentUrl: string;
}

export interface BuildArticleSourceUpsertInput {
  articleId: string;
  durableSourceId?: string | null;
  sourceUrl: string;
  role?: ArticleSourceRoleValue | null;
  supportStrength?: ArticleSourceSupportStrengthValue | null;
  provenance?: ArticleSourceProvenanceValue | null;
  profileSnapshot?: ArticleSourceProfileSnapshot | null;
  profileVersion?: number | null;
  snapshotAt?: Date | string | null;
  position?: number | null;
  preserveExistingSnapshot?: boolean;
}

export function normalizeArticleSourceUrl(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;

  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = '';

    const sortedParams = [...url.searchParams.entries()]
      .filter(([key]) => !isTrackingQueryParameter(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
    url.search = '';
    for (const [key, value] of sortedParams) url.searchParams.append(key, value);

    return url.toString();
  } catch {
    return null;
  }
}

function isTrackingQueryParameter(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized.startsWith('utm_') || TRACKING_QUERY_PARAMETERS.has(normalized);
}

export function hashArticleSourceUrl(input: unknown): string | null {
  const normalizedUrl = normalizeArticleSourceUrl(input);
  if (!normalizedUrl) return null;
  return createHash('sha256').update(normalizedUrl).digest('hex');
}

export function buildArticleSourceProfileSnapshot(input: {
  profileData?: unknown;
  profileConfidence?: unknown;
  publicTrustLabel?: unknown;
  lastProfiledAt?: Date | string | null;
  snapshotAt?: Date | string;
  sourceUrl?: unknown;
  actorName?: unknown;
  actorDescription?: unknown;
  contentTitle?: unknown;
}): ArticleSourceProfileSnapshot {
  const snapshotAt = toIsoString(input.snapshotAt) ?? new Date().toISOString();
  const profileData = removeTechnicalScoreFields(input.profileData);

  const platformContext = extractPlatformArticleContext({
    sourceUrl: input.sourceUrl,
    actorName: input.actorName,
    actorDescription: input.actorDescription,
    contentTitle: input.contentTitle,
  });

  return {
    profileData,
    profileConfidence: cleanOptionalString(input.profileConfidence),
    publicTrustLabel: cleanOptionalString(input.publicTrustLabel),
    lastProfiledAt: toIsoString(input.lastProfiledAt),
    snapshotAt,
    ...(platformContext ? { platformContext } : {}),
  };
}

const PLATFORM_BY_DOMAIN: Record<string, string> = {
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'reddit.com': 'Reddit',
  'x.com': 'X',
  'twitter.com': 'X',
  'instagram.com': 'Instagram',
  'facebook.com': 'Facebook',
  'fb.watch': 'Facebook',
  'tiktok.com': 'TikTok',
  'dailymotion.com': 'Dailymotion',
};

export function isPlatformSourceDomain(input: unknown): boolean {
  return platformNameFromUrl(input) !== null;
}

export function extractPlatformArticleContext(input: {
  sourceUrl?: unknown;
  actorName?: unknown;
  actorDescription?: unknown;
  contentTitle?: unknown;
}): PlatformArticleContext | null {
  const contentUrl = normalizeArticleSourceUrl(input.sourceUrl);
  if (!contentUrl) return null;

  const url = new URL(contentUrl);
  const domain = url.hostname.replace(/^www\./, '').toLowerCase();
  const platform = PLATFORM_BY_DOMAIN[domain];
  if (!platform) return null;

  const derived = deriveActorFromPlatformUrl(platform, url);
  const actorName = cleanOptionalString(input.actorName) ?? derived.actorName;
  const actorDescription = cleanOptionalString(input.actorDescription);
  const contentTitle = cleanOptionalString(input.contentTitle);

  return {
    platform,
    ...(actorName ? { actorName } : {}),
    ...(derived.handle ? { handle: derived.handle } : {}),
    ...(derived.actorUrl ? { actorUrl: derived.actorUrl } : {}),
    ...(actorName || derived.handle ? { actorType: derived.actorType } : {}),
    ...(actorDescription ? { actorDescription } : {}),
    ...(contentTitle ? { contentTitle } : {}),
    contentUrl,
  };
}

function platformNameFromUrl(input: unknown): string | null {
  const normalized = normalizeArticleSourceUrl(input);
  if (!normalized) return null;
  return PLATFORM_BY_DOMAIN[new URL(normalized).hostname.replace(/^www\./, '').toLowerCase()] ?? null;
}

function deriveActorFromPlatformUrl(platform: string, url: URL): {
  actorName?: string;
  handle?: string;
  actorUrl?: string;
  actorType: PlatformActorType;
} {
  const parts = url.pathname.split('/').filter(Boolean);
  let rawHandle: string | undefined;
  let actorType: PlatformActorType = platform === 'YouTube' || platform === 'Dailymotion'
    ? 'CHANNEL'
    : 'ACCOUNT';

  if (platform === 'YouTube') {
    if (parts[0]?.startsWith('@')) rawHandle = parts[0];
    else if (['channel', 'user', 'c'].includes(parts[0]) && parts[1]) rawHandle = parts[1];
  } else if (platform === 'TikTok' && parts[0]?.startsWith('@')) {
    rawHandle = parts[0];
  } else if (platform === 'X' && parts[0] && !['home', 'explore', 'search', 'i'].includes(parts[0])) {
    rawHandle = parts[0];
  } else if (platform === 'Instagram' && parts[0] && !['p', 'reel', 'reels', 'stories', 'explore'].includes(parts[0])) {
    rawHandle = parts[0];
  } else if (platform === 'Facebook' && parts[0] && !['watch', 'reel', 'share', 'photo', 'groups'].includes(parts[0])) {
    rawHandle = parts[0];
  } else if (platform === 'Reddit') {
    if (parts[0] === 'user' && parts[1]) rawHandle = parts[1];
    if (parts[0] === 'r' && parts[1]) {
      rawHandle = `r/${parts[1]}`;
      actorType = 'COMMUNITY';
    }
  } else if (platform === 'Dailymotion' && parts[0] === 'user' && parts[1]) {
    rawHandle = parts[1];
  }

  if (!rawHandle) return { actorType };
  const handle = rawHandle.startsWith('@') || rawHandle.startsWith('r/') ? rawHandle : `@${rawHandle}`;
  const actorPath = platform === 'Reddit' && rawHandle.startsWith('r/')
    ? `/${rawHandle}`
    : platform === 'Reddit' ? `/user/${rawHandle}`
      : platform === 'YouTube' && parts[0] && ['channel', 'user', 'c'].includes(parts[0]) ? `/${parts[0]}/${rawHandle}`
        : platform === 'Dailymotion' ? `/user/${rawHandle}`
          : `/${rawHandle}`;

  return {
    actorName: handle,
    handle,
    actorUrl: `${url.protocol}//${url.host}${actorPath}`,
    actorType,
  };
}

export function deriveArticleSourceRoleFromLane(
  lane: unknown,
  options: { explicitOfficialStatement?: boolean } = {},
): ArticleSourceRoleValue {
  if (options.explicitOfficialStatement === true) return 'OFFICIAL_STATEMENT';
  if (typeof lane !== 'string') return 'UNKNOWN';

  switch (lane.trim().toUpperCase()) {
    case 'FACTUAL': return 'PRIMARY_EVIDENCE';
    case 'CRITICAL': return 'COUNTERPOINT';
    case 'CONTEXTUAL': return 'CONTEXT';
    default: return 'UNKNOWN';
  }
}

export function deriveArticleSourceSupportStrength(signal: unknown): ArticleSourceSupportStrengthValue {
  if (typeof signal !== 'string') return 'UNKNOWN';
  switch (signal.trim().toUpperCase()) {
    case 'STRONG': return 'STRONG';
    case 'MODERATE': return 'MODERATE';
    case 'WEAK': return 'WEAK';
    default: return 'UNKNOWN';
  }
}

export function buildArticleSourceUpsertInput(
  input: BuildArticleSourceUpsertInput,
): Prisma.ArticleSourceUpsertArgs | null {
  const articleId = cleanOptionalString(input.articleId);
  const durableSourceId = cleanOptionalString(input.durableSourceId);
  const sourceUrl = normalizeArticleSourceUrl(input.sourceUrl);
  const sourceUrlHash = sourceUrl ? hashArticleSourceUrl(sourceUrl) : null;

  if (!articleId || !durableSourceId || !sourceUrl || !sourceUrlHash) return null;

  const role = normalizeRole(input.role);
  const supportStrength = deriveArticleSourceSupportStrength(input.supportStrength);
  const provenance = normalizeProvenance(input.provenance);
  const snapshotAt = toDate(input.snapshotAt ?? input.profileSnapshot?.snapshotAt);
  const position = Number.isInteger(input.position) && (input.position as number) >= 0
    ? input.position as number
    : null;

  const profileSnapshot = input.profileSnapshot
    ? toPrismaJson(input.profileSnapshot)
    : Prisma.JsonNull;
  const snapshotValues = {
    profileSnapshot,
    profileVersion: Number.isInteger(input.profileVersion) ? input.profileVersion as number : null,
    snapshotAt,
  };
  const values = {
    sourceId: durableSourceId,
    sourceUrl,
    role,
    supportStrength,
    provenance,
    position,
  };

  return {
    where: { articleId_sourceUrlHash: { articleId, sourceUrlHash } },
    create: { articleId, sourceUrlHash, ...values, ...snapshotValues },
    update: input.preserveExistingSnapshot ? values : { ...values, ...snapshotValues },
  };
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function cleanOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toIsoString(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDate(value: unknown): Date | null {
  const iso = toIsoString(value);
  return iso ? new Date(iso) : null;
}

function removeTechnicalScoreFields(value: unknown): unknown | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? null;
  const { trustScore: _trustScore, ...profileData } = value as Record<string, unknown>;
  return profileData;
}

function normalizeRole(value: unknown): ArticleSourceRoleValue {
  const roles = new Set<ArticleSourceRoleValue>([
    'PRIMARY_EVIDENCE', 'CONTEXT', 'COUNTERPOINT', 'OFFICIAL_STATEMENT', 'BACKGROUND', 'UNKNOWN',
  ]);
  return typeof value === 'string' && roles.has(value as ArticleSourceRoleValue)
    ? value as ArticleSourceRoleValue
    : 'UNKNOWN';
}

function normalizeProvenance(value: unknown): ArticleSourceProvenanceValue {
  const provenances = new Set<ArticleSourceProvenanceValue>([
    'WEB_SEARCH', 'INTERNAL_RAG', 'USER_PROVIDED', 'EDITORIAL', 'IMPORTED_LEGACY', 'UNKNOWN',
  ]);
  return typeof value === 'string' && provenances.has(value as ArticleSourceProvenanceValue)
    ? value as ArticleSourceProvenanceValue
    : 'UNKNOWN';
}
