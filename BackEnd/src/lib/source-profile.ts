import type { ConfidenceLevel } from '@prisma/client';

export type SourceProfileConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type PublicTrustLabelKey =
  | 'very_strong'
  | 'strong'
  | 'nuanced'
  | 'fragile'
  | 'unverified'
  | 'unsourced';

export interface SourceProfileReference {
  label: string;
  url?: string;
}

export interface SourceProfileDataV1 {
  description?: string;
  country?: string;
  type?: string;
  strengths?: string[];
  warnings?: string[];
  externalReferences?: SourceProfileReference[];
  provenance?: string[];
  methodVersion: 'source-profile-v1';
}

export interface SourceProfileTrustScoreInput {
  metadata?: {
    description?: unknown;
    country?: unknown;
    type?: unknown;
  } | null;
  profileData?: unknown;
}

const PUBLIC_TYPE_LABELS: Record<string, string | null> = {
  AGENCY: 'Agence de presse',
  MEDIA: 'Média',
  ACADEMIC: 'Académique',
  GOVERNMENT: 'Officiel',
  BLOG: 'Blog',
  SOCIAL: 'Réseau',
  COMMERCIAL: 'Commercial',
  GENERAL: null,
  UNKNOWN: null,
  REPORT: null,
};

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function normalizeKey(value: string): string {
  return value
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function sanitizeCountry(value: unknown): string | undefined {
  const country = cleanText(value);
  if (!country || ['UNKNOWN', 'N/A', 'NA'].includes(normalizeKey(country))) return undefined;
  return country;
}

function sanitizeType(value: unknown): string | undefined {
  const type = cleanText(value);
  if (!type) return undefined;

  const mapped = PUBLIC_TYPE_LABELS[normalizeKey(type)];
  if (mapped !== undefined) return mapped ?? undefined;

  const normalized = normalizeKey(type);
  if (normalized === 'UNKNOWN' || normalized === 'REPORT') return undefined;
  return type;
}

function listItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const nested = [record.items, record.values, record.points, record.signals, record.list, record.entries]
    .find(Array.isArray);
  return Array.isArray(nested) ? nested : [];
}

function sanitizeList(...values: unknown[]): string[] | undefined {
  const items = values.flatMap(listItems);
  const cleaned = Array.from(new Set(items.map((item) => {
    if (typeof item === 'string') return cleanText(item);
    if (!item || typeof item !== 'object') return undefined;
    const record = item as Record<string, unknown>;
    return cleanText(record.label)
      ?? cleanText(record.title)
      ?? cleanText(record.text)
      ?? cleanText(record.description)
      ?? cleanText(record.reason);
  }).filter((item): item is string => Boolean(item))));

  return cleaned.length > 0 ? cleaned : undefined;
}

function sanitizeReferences(...values: unknown[]): SourceProfileReference[] | undefined {
  const references = values.flatMap(listItems).flatMap((item): SourceProfileReference[] => {
    if (typeof item === 'string') {
      const label = cleanText(item);
      return label ? [{ label }] : [];
    }
    if (!item || typeof item !== 'object') return [];

    const record = item as Record<string, unknown>;
    const label = cleanText(record.label)
      ?? cleanText(record.title)
      ?? cleanText(record.name)
      ?? cleanText(record.source)
      ?? cleanText(record.url);
    if (!label) return [];

    const rawUrl = cleanText(record.url) ?? cleanText(record.href) ?? cleanText(record.link);
    if (!rawUrl) return [{ label }];

    try {
      const url = new URL(rawUrl);
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? [{ label, url: url.toString() }]
        : [{ label }];
    } catch {
      return [{ label }];
    }
  });

  const unique = references.filter((reference, index, all) => (
    all.findIndex((candidate) => candidate.label === reference.label && candidate.url === reference.url) === index
  ));
  return unique.length > 0 ? unique : undefined;
}

export function sanitizeSourceProfileData(input: unknown): SourceProfileDataV1 | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const record = input as Record<string, unknown>;
  const output: SourceProfileDataV1 = {
    methodVersion: 'source-profile-v1',
  };

  const description = cleanText(record.description);
  const country = sanitizeCountry(record.country);
  const type = sanitizeType(record.type);
  const strengths = sanitizeList(record.strengths, record.positiveSignals, record.favorableElements);
  const warnings = sanitizeList(
    record.warnings,
    record.criticisms,
    record.limitations,
    record.risks,
    record.negativeSignals,
  );
  const externalReferences = sanitizeReferences(
    record.externalReferences,
    record.references,
    record.reputationReferences,
  );
  const provenance = sanitizeList(record.provenance);

  if (description) output.description = description;
  if (country) output.country = country;
  if (type) output.type = type;
  if (strengths) output.strengths = strengths;
  if (warnings) output.warnings = warnings;
  if (externalReferences) output.externalReferences = externalReferences;
  if (provenance) output.provenance = provenance;

  return Object.keys(output).length > 1 ? output : null;
}

export function normalizeSourceProfileData(input: unknown): SourceProfileDataV1 | null {
  return sanitizeSourceProfileData(input);
}

export function mergeSourceProfileData(
  existing: SourceProfileDataV1 | null,
  candidate: SourceProfileDataV1 | null,
): SourceProfileDataV1 | null {
  if (!existing) return candidate;
  if (!candidate) return existing;

  return {
    ...existing,
    ...candidate,
    strengths: candidate.strengths ?? existing.strengths,
    warnings: candidate.warnings ?? existing.warnings,
    externalReferences: candidate.externalReferences ?? existing.externalReferences,
    provenance: candidate.provenance ?? existing.provenance,
    methodVersion: 'source-profile-v1',
  };
}

export function buildSourceProfileDataFromTrustScore(
  input: SourceProfileTrustScoreInput,
): SourceProfileDataV1 | null {
  const legacy = sanitizeSourceProfileData(input.profileData);
  const candidate = sanitizeSourceProfileData({
    description: input.metadata?.description,
    country: input.metadata?.country,
    type: input.metadata?.type,
  });

  return mergeSourceProfileData(legacy, candidate);
}

export function derivePublicTrustLabelFromTrustScore(score: number | null | undefined): PublicTrustLabelKey {
  if (score === null || score === undefined || !Number.isFinite(score)) return 'unsourced';
  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  if (normalized >= 90) return 'very_strong';
  if (normalized >= 70) return 'strong';
  if (normalized >= 50) return 'nuanced';
  if (normalized >= 30) return 'fragile';
  return 'unverified';
}

export function resolveSourceProfileConfidence(
  current: ConfidenceLevel | null | undefined,
  isConsensusVerified: boolean,
): SourceProfileConfidence {
  if (isConsensusVerified) return 'HIGH';
  return current ?? 'LOW';
}
