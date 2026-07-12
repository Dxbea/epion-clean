import type { ConfidenceLevel } from '@prisma/client';

/** Current JSON structure version. Increment only when the profile shape changes. */
export const SOURCE_PROFILE_VERSION = 1 as const;
export const SOURCE_PROFILE_METHOD_VERSION = 'source-profile-v1' as const;

export type SourceProfileConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type PublicTrustLabelKey =
  | 'very_strong'
  | 'strong'
  | 'nuanced'
  | 'fragile'
  | 'unverified'
  | 'unsourced';

export interface SourceProfileReference {
  id: string;
  label: string;
  url?: string;
  publisher?: string;
  referenceType?: string;
}

export type SourceProfileClaimReferences = Record<string, string[]>;

export interface SourceFacts {
  ownership?: string;
  businessModel?: string;
  specialty?: string;
  country?: string;
  type?: string;
  coverageArea?: string;
}

export interface SourceEditorialReputation {
  editorialPositioning?: string;
  generalReputation?: string;
  reliabilitySignals?: string[];
  misinformationSignals?: string[];
  correctionHistory?: string;
  editorialPolicy?: string;
}

export interface SourceProfileDataV1 {
  description?: string;
  profileSummary?: string;
  sourceFacts?: SourceFacts;
  editorialReputation?: SourceEditorialReputation;
  vigilancePoints?: string[];
  externalReferences?: SourceProfileReference[];
  claimReferences?: SourceProfileClaimReferences;
  provenance?: string[];
  methodVersion: typeof SOURCE_PROFILE_METHOD_VERSION;
}

export interface SourceProfileTrustScoreInput {
  metadata?: {
    description?: unknown;
    country?: unknown;
    type?: unknown;
  } | null;
  profileData?: unknown;
  domain?: string;
  strengths?: unknown;
  vigilancePoints?: unknown;
  externalReferences?: unknown;
  profileSummary?: unknown;
  ownership?: unknown;
  businessModel?: unknown;
  editorialPositioning?: unknown;
  specialty?: unknown;
  coverageArea?: unknown;
  generalReputation?: unknown;
  misinformationSignals?: unknown;
  correctionHistory?: unknown;
  editorialPolicy?: unknown;
  claimReferences?: unknown;
}

export interface DurableSourceProfile {
  domain: string;
  profileData: unknown;
  profileVersion: number | null;
  profileConfidence: ConfidenceLevel | null;
  lastProfiledAt: Date | null;
  publicTrustLabel: string | null;
}

export type SourceProfileLookup = (domains: string[]) => Promise<DurableSourceProfile[]>;

const PUBLIC_TRUST_LABELS = new Set<PublicTrustLabelKey>([
  'very_strong',
  'strong',
  'nuanced',
  'fragile',
  'unverified',
  'unsourced',
]);

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

const TYPE_VIGILANCE_POINTS: Partial<Record<string, string>> = {
  SOCIAL: 'Limite liée au type : les contenus publiés sur un réseau social peuvent provenir d’auteurs très différents et nécessitent une vérification au cas par cas.',
  MEDIA: 'Limite liée au type : un média sélectionne et hiérarchise l’information selon sa ligne éditoriale ; les affirmations importantes doivent être recoupées.',
  AGENCY: 'Limite liée au type : une dépêche d’agence fournit souvent un premier état de l’information, susceptible d’être complété à mesure que les faits sont établis.',
  GOVERNMENT: 'Limite liée au type : une institution communique depuis son propre périmètre et son propre mandat ; ses affirmations doivent être distinguées d’une évaluation indépendante.',
  COMMERCIAL: 'Limite liée au type : une source commerciale peut avoir un intérêt direct dans la présentation de ses produits, services ou résultats.',
};

function deriveTypeVigilancePoint(type: unknown, domain: unknown): string | undefined {
  const normalizedType = typeof type === 'string' ? normalizeKey(type) : '';
  const normalizedDomain = normalizeSourceDomain(domain);
  if (normalizedDomain === 'wikipedia.org' || normalizedDomain?.endsWith('.wikipedia.org')) {
    return 'Limite liée au type : une encyclopédie collaborative peut être modifiée au fil du temps ; les références citées dans l’article doivent être consultées pour les affirmations sensibles.';
  }
  if (['youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'tiktok.com'].includes(normalizedDomain ?? '')) {
    return 'Limite liée au type : une plateforme vidéo héberge des contenus produits par des auteurs très différents ; la fiabilité dépend de la vidéo et de son auteur.';
  }
  return TYPE_VIGILANCE_POINTS[normalizedType];
}

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

export function normalizeSourceDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return null;

  try {
    const url = new URL(cleaned.includes('://') ? cleaned : `https://${cleaned}`);
    return url.hostname.replace(/^www\./, '') || null;
  } catch {
    return cleaned
      .replace(/^www\./, '')
      .replace(/[/:].*$/, '') || null;
  }
}

function sanitizePublicTrustLabel(value: unknown): PublicTrustLabelKey | undefined {
  return typeof value === 'string' && PUBLIC_TRUST_LABELS.has(value as PublicTrustLabelKey)
    ? value as PublicTrustLabelKey
    : undefined;
}

function sanitizeProfileConfidence(value: unknown): SourceProfileConfidence | undefined {
  return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' ? value : undefined;
}

function sourceDomain(source: Record<string, unknown>): string | null {
  return normalizeSourceDomain(source.domain) ?? normalizeSourceDomain(source.url);
}

export async function hydrateSourcesWithProfiles<T extends Record<string, any>>(
  sources: T[],
  lookup: SourceProfileLookup,
): Promise<T[]> {
  if (!Array.isArray(sources) || sources.length === 0) return sources;

  const domains = Array.from(new Set(sources.map(sourceDomain).filter((domain): domain is string => Boolean(domain))));
  const durableProfiles = domains.length > 0 ? await lookup(domains) : [];
  const profilesByDomain = new Map(
    durableProfiles.map((profile) => [normalizeSourceDomain(profile.domain), profile] as const)
      .filter((entry): entry is [string, DurableSourceProfile] => Boolean(entry[0])),
  );

  return sources.map((source) => {
    const domain = sourceDomain(source);
    const durable = domain ? profilesByDomain.get(domain) : undefined;

    const snapshotProfile = sanitizeSourceProfileData(source.profileData);
    const durableProfile = sanitizeSourceProfileData(durable?.profileData);
    const profileData = snapshotProfile ?? durableProfile;
    const publicTrustLabel = sanitizePublicTrustLabel(source.publicTrustLabel)
      ?? sanitizePublicTrustLabel(durable?.publicTrustLabel);
    const profileConfidence = sanitizeProfileConfidence(source.profileConfidence)
      ?? sanitizeProfileConfidence(durable?.profileConfidence);
    const profileVersion = Number.isInteger(source.profileVersion) && source.profileVersion > 0
      ? source.profileVersion
      : durable?.profileVersion && durable.profileVersion > 0 ? durable.profileVersion : undefined;
    const lastProfiledAt = typeof source.lastProfiledAt === 'string' && source.lastProfiledAt.trim()
      ? source.lastProfiledAt
      : durable?.lastProfiledAt?.toISOString();

    const {
      profileData: _profileData,
      profileVersion: _profileVersion,
      profileConfidence: _profileConfidence,
      lastProfiledAt: _lastProfiledAt,
      publicTrustLabel: _publicTrustLabel,
      ...legacySource
    } = source;

    return {
      ...legacySource,
      ...(profileData ? { profileData } : {}),
      ...(profileVersion ? { profileVersion } : {}),
      ...(profileConfidence ? { profileConfidence } : {}),
      ...(lastProfiledAt ? { lastProfiledAt } : {}),
      ...(publicTrustLabel ? { publicTrustLabel } : {}),
    } as T;
  });
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
      return label ? [{ id: '', label }] : [];
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
    const publisher = cleanText(record.publisher) ?? cleanText(record.editor);
    const referenceType = cleanText(record.referenceType) ?? cleanText(record.type);
    const id = cleanText(record.id) ?? '';
    if (!rawUrl) return [{ id, label, ...(publisher ? { publisher } : {}), ...(referenceType ? { referenceType } : {}) }];

    try {
      const url = new URL(rawUrl);
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? [{ id, label, url: url.toString(), ...(publisher ? { publisher } : {}), ...(referenceType ? { referenceType } : {}) }]
        : [{ id, label, ...(publisher ? { publisher } : {}), ...(referenceType ? { referenceType } : {}) }];
    } catch {
      return [{ id, label, ...(publisher ? { publisher } : {}), ...(referenceType ? { referenceType } : {}) }];
    }
  });

  const unique = references.filter((reference, index, all) => (
    all.findIndex((candidate) => candidate.label === reference.label && candidate.url === reference.url) === index
  ));
  return unique.length > 0
    ? unique.map((reference, index) => ({ ...reference, id: reference.id || `ref_${index + 1}` }))
    : undefined;
}

function sanitizeClaimReferences(
  value: unknown,
  references: SourceProfileReference[] | undefined,
): SourceProfileClaimReferences | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !references?.length) return undefined;
  const validIds = new Set(references.map((reference) => reference.id));
  const output: SourceProfileClaimReferences = {};
  for (const [path, rawIds] of Object.entries(value as Record<string, unknown>)) {
    const cleanPath = cleanText(path);
    if (!cleanPath || !Array.isArray(rawIds)) continue;
    const ids = Array.from(new Set(rawIds
      .map(cleanText)
      .filter((id): id is string => Boolean(id && validIds.has(id)))));
    if (ids.length > 0) output[cleanPath] = ids;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function hasClaimEvidence(claimReferences: SourceProfileClaimReferences | undefined, path: string): boolean {
  return Boolean(claimReferences?.[path]?.length);
}

function isSensitiveVigilancePoint(value: string): boolean {
  return /(d[ée]sinformation|fake news|propagand|complot|controvers|politi|partisan|biais|orientation|accus|condamn|sanction|manquement|trompeu|mensong)/i.test(value);
}

export function sanitizeSourceProfileData(input: unknown): SourceProfileDataV1 | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const record = input as Record<string, unknown>;
  const output: SourceProfileDataV1 = {
    methodVersion: SOURCE_PROFILE_METHOD_VERSION,
  };

  const description = cleanText(record.description);
  const profileSummary = cleanText(record.profileSummary) ?? description;
  const rawFacts = record.sourceFacts && typeof record.sourceFacts === 'object' && !Array.isArray(record.sourceFacts)
    ? record.sourceFacts as Record<string, unknown>
    : {};
  const sourceFacts: SourceFacts = {
    ...(cleanText(rawFacts.ownership) ?? cleanText(record.ownership) ? { ownership: cleanText(rawFacts.ownership) ?? cleanText(record.ownership) } : {}),
    ...(cleanText(rawFacts.businessModel) ?? cleanText(record.businessModel) ? { businessModel: cleanText(rawFacts.businessModel) ?? cleanText(record.businessModel) } : {}),
    ...(cleanText(rawFacts.specialty) ?? cleanText(record.specialty) ? { specialty: cleanText(rawFacts.specialty) ?? cleanText(record.specialty) } : {}),
    ...(sanitizeCountry(rawFacts.country ?? record.country) ? { country: sanitizeCountry(rawFacts.country ?? record.country) } : {}),
    ...(sanitizeType(rawFacts.type ?? record.type) ? { type: sanitizeType(rawFacts.type ?? record.type) } : {}),
    ...(cleanText(rawFacts.coverageArea) ?? cleanText(record.coverageArea) ? { coverageArea: cleanText(rawFacts.coverageArea) ?? cleanText(record.coverageArea) } : {}),
  };
  const rawReputation = record.editorialReputation && typeof record.editorialReputation === 'object' && !Array.isArray(record.editorialReputation)
    ? record.editorialReputation as Record<string, unknown>
    : {};
  const externalReferences = sanitizeReferences(
    record.externalReferences,
    record.references,
    record.reputationReferences,
  );
  const claimReferences = sanitizeClaimReferences(record.claimReferences, externalReferences);
  const editorialReputation: SourceEditorialReputation = {};
  const editorialPositioning = cleanText(rawReputation.editorialPositioning) ?? cleanText(record.editorialPositioning);
  const generalReputation = cleanText(rawReputation.generalReputation) ?? cleanText(record.generalReputation);
  const reliabilitySignals = sanitizeList(rawReputation.reliabilitySignals, record.strengths, record.positiveSignals);
  const misinformationSignals = sanitizeList(rawReputation.misinformationSignals, record.misinformationSignals);
  const correctionHistory = cleanText(rawReputation.correctionHistory) ?? cleanText(record.correctionHistory);
  const editorialPolicy = cleanText(rawReputation.editorialPolicy) ?? cleanText(record.editorialPolicy);
  if (editorialPositioning && hasClaimEvidence(claimReferences, 'editorialReputation.editorialPositioning')) editorialReputation.editorialPositioning = editorialPositioning;
  if (generalReputation && hasClaimEvidence(claimReferences, 'editorialReputation.generalReputation')) editorialReputation.generalReputation = generalReputation;
  if (reliabilitySignals && hasClaimEvidence(claimReferences, 'editorialReputation.reliabilitySignals')) editorialReputation.reliabilitySignals = reliabilitySignals;
  if (misinformationSignals && hasClaimEvidence(claimReferences, 'editorialReputation.misinformationSignals')) editorialReputation.misinformationSignals = misinformationSignals;
  if (correctionHistory && hasClaimEvidence(claimReferences, 'editorialReputation.correctionHistory')) editorialReputation.correctionHistory = correctionHistory;
  if (editorialPolicy && hasClaimEvidence(claimReferences, 'editorialReputation.editorialPolicy')) editorialReputation.editorialPolicy = editorialPolicy;
  const rawVigilancePoints = sanitizeList(
    record.vigilancePoints,
    record.warnings,
    record.criticisms,
    record.limitations,
    record.risks,
    record.negativeSignals,
  );
  const vigilancePoints = rawVigilancePoints?.filter((point) => (
    !isSensitiveVigilancePoint(point) || hasClaimEvidence(claimReferences, 'vigilancePoints')
  ));
  const provenance = sanitizeList(record.provenance);

  if (description) output.description = description;
  if (profileSummary) output.profileSummary = profileSummary;
  if (Object.keys(sourceFacts).length > 0) output.sourceFacts = sourceFacts;
  if (Object.keys(editorialReputation).length > 0) output.editorialReputation = editorialReputation;
  if (vigilancePoints) output.vigilancePoints = vigilancePoints;
  if (externalReferences) output.externalReferences = externalReferences;
  if (claimReferences) output.claimReferences = claimReferences;
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
    sourceFacts: { ...existing.sourceFacts, ...candidate.sourceFacts },
    editorialReputation: { ...existing.editorialReputation, ...candidate.editorialReputation },
    vigilancePoints: candidate.vigilancePoints ?? existing.vigilancePoints,
    externalReferences: candidate.externalReferences ?? existing.externalReferences,
    claimReferences: { ...existing.claimReferences, ...candidate.claimReferences },
    provenance: candidate.provenance ?? existing.provenance,
    methodVersion: SOURCE_PROFILE_METHOD_VERSION,
  };
}

export function buildSourceProfileDataFromTrustScore(
  input: SourceProfileTrustScoreInput,
): SourceProfileDataV1 | null {
  const legacy = sanitizeSourceProfileData(input.profileData);
  const documentedReferences = sanitizeReferences(input.externalReferences);
  const claimReferences = sanitizeClaimReferences(input.claimReferences, documentedReferences);
  const documentedVigilancePoints = documentedReferences
    ? sanitizeList(input.vigilancePoints)
    : undefined;
  const candidate = sanitizeSourceProfileData({
    description: input.metadata?.description,
    profileSummary: documentedReferences ? input.profileSummary : input.metadata?.description,
    sourceFacts: {
      ownership: documentedReferences ? input.ownership : undefined,
      businessModel: documentedReferences ? input.businessModel : undefined,
      specialty: documentedReferences ? input.specialty : undefined,
      coverageArea: documentedReferences ? input.coverageArea : undefined,
      country: input.metadata?.country,
      type: input.metadata?.type,
    },
    editorialReputation: {
      editorialPositioning: documentedReferences ? input.editorialPositioning : undefined,
      generalReputation: documentedReferences ? input.generalReputation : undefined,
      reliabilitySignals: documentedReferences ? input.strengths : undefined,
      misinformationSignals: documentedReferences ? input.misinformationSignals : undefined,
      correctionHistory: documentedReferences ? input.correctionHistory : undefined,
      editorialPolicy: documentedReferences ? input.editorialPolicy : undefined,
    },
    vigilancePoints: documentedVigilancePoints
      ?? sanitizeList(deriveTypeVigilancePoint(input.metadata?.type, input.domain)),
    externalReferences: documentedReferences,
    claimReferences,
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
  hasDocumentedProfile = false,
): SourceProfileConfidence {
  if (isConsensusVerified) return 'HIGH';
  if (hasDocumentedProfile && (!current || current === 'LOW')) return 'MEDIUM';
  return current ?? 'LOW';
}
