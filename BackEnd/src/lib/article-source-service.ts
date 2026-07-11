import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

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
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
    url.search = '';
    for (const [key, value] of sortedParams) url.searchParams.append(key, value);

    return url.toString();
  } catch {
    return null;
  }
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
}): ArticleSourceProfileSnapshot {
  const snapshotAt = toIsoString(input.snapshotAt) ?? new Date().toISOString();
  const profileData = removeTechnicalScoreFields(input.profileData);

  return {
    profileData,
    profileConfidence: cleanOptionalString(input.profileConfidence),
    publicTrustLabel: cleanOptionalString(input.publicTrustLabel),
    lastProfiledAt: toIsoString(input.lastProfiledAt),
    snapshotAt,
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
  const values = {
    sourceId: durableSourceId,
    sourceUrl,
    role,
    supportStrength,
    provenance,
    profileSnapshot,
    profileVersion: Number.isInteger(input.profileVersion) ? input.profileVersion as number : null,
    snapshotAt,
    position,
  };

  return {
    where: { articleId_sourceUrlHash: { articleId, sourceUrlHash } },
    create: { articleId, sourceUrlHash, ...values },
    update: values,
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
