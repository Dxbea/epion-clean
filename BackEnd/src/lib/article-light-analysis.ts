import type {
  ArticleLightAnalysisConfidence,
  ArticleLightAnalysisV1,
  ArticleLightSupportLevel,
} from './score-types.js';

export interface BuildArticleLightAnalysisInput {
  articleSources?: unknown;
  factCheckData?: unknown;
  contentHash?: unknown;
  factCheckStatus?: unknown;
  analyzedAt: string;
}

type SourceRole =
  | 'PRIMARY_EVIDENCE'
  | 'CONTEXT'
  | 'COUNTERPOINT'
  | 'OFFICIAL_STATEMENT'
  | 'BACKGROUND'
  | 'UNKNOWN';

interface LightSource {
  domain: string | null;
  role: SourceRole;
  durable: boolean;
  profiled: boolean;
  weakProfile: boolean;
  unknown: boolean;
  usable: boolean;
  metadataOnly: boolean;
  unavailable: boolean;
}

export function buildArticleLightAnalysis(
  input: BuildArticleLightAnalysisInput,
): ArticleLightAnalysisV1 {
  try {
    const relationSources = asObjectArray(input.articleSources);
    const legacySources = readLegacySources(input.factCheckData);
    const sources = relationSources.length > 0
      ? normalizeRelationSources(relationSources, legacySources)
      : legacySources.map(normalizeLegacySource);

    return evaluateSources(sources, input);
  } catch {
    return buildErrorAnalysis(input);
  }
}

function evaluateSources(
  sources: LightSource[],
  input: BuildArticleLightAnalysisInput,
): ArticleLightAnalysisV1 {
  const totalSources = sources.length;
  const usableSources = sources.filter((source) => source.usable).length;
  const uniqueDomains = new Set(
    sources.map((source) => source.domain).filter((domain): domain is string => Boolean(domain)),
  ).size;
  const durableSourceCount = sources.filter((source) => source.durable).length;
  const profiledSourceCount = sources.filter((source) => source.profiled).length;
  const metadataOnlyCount = sources.filter((source) => source.metadataOnly).length;
  const unavailableCount = sources.filter((source) => source.unavailable).length;
  const unknownSourceCount = sources.filter((source) => source.unknown).length;
  const weakProfileCount = sources.filter((source) => source.weakProfile).length;
  const profileCoverage = totalSources > 0
    ? roundRatio(profiledSourceCount / totalSources)
    : 0;

  const primaryEvidenceCount = countRole(sources, 'PRIMARY_EVIDENCE');
  const officialStatementCount = countRole(sources, 'OFFICIAL_STATEMENT');
  const contextCount = countRole(sources, 'CONTEXT');
  const counterpointCount = countRole(sources, 'COUNTERPOINT');
  const backgroundCount = countRole(sources, 'BACKGROUND');
  const unknownRoleCount = countRole(sources, 'UNKNOWN');
  const hasPrimaryEvidence = primaryEvidenceCount + officialStatementCount > 0;
  const incompleteCount = metadataOnlyCount + unavailableCount;

  const supportLevel = deriveLightSupportLevel({
    totalSources,
    usableSources,
    uniqueDomains,
    unknownSourceCount,
    profileCoverage,
    hasPrimaryEvidence,
    incompleteCount,
  });
  const analysisConfidence = deriveAnalysisConfidence({
    supportLevel,
    usableSources,
    profileCoverage,
    unknownSourceCount,
    incompleteCount,
  });

  const limitations: string[] = [];
  const uncertainties: string[] = [];
  const deepAnalysisReasons: string[] = [];

  if (usableSources < 2) {
    limitations.push('INSUFFICIENT_USABLE_SOURCES');
    deepAnalysisReasons.push('INSUFFICIENT_SOURCES');
  }
  if (uniqueDomains < 2) {
    limitations.push('LOW_DOMAIN_DIVERSITY');
    deepAnalysisReasons.push('LOW_DOMAIN_DIVERSITY');
  }
  if (!hasPrimaryEvidence) {
    limitations.push('NO_PRIMARY_OR_OFFICIAL_SOURCE');
    deepAnalysisReasons.push('NO_PRIMARY_EVIDENCE');
  }
  if (unknownSourceCount > 0) {
    uncertainties.push('UNKNOWN_SOURCE_PROFILE');
    deepAnalysisReasons.push('UNKNOWN_SOURCE');
  }
  if (weakProfileCount > 0 || profileCoverage < 0.67) {
    uncertainties.push('PROFILE_COVERAGE_PARTIAL');
    deepAnalysisReasons.push('WEAK_SOURCE_PROFILE');
  }
  if (incompleteCount > 0) {
    limitations.push('INCOMPLETE_SOURCE_EXTRACTION');
    deepAnalysisReasons.push('INCOMPLETE_EXTRACTION');
  }
  if (normalizeText(input.factCheckStatus) === 'STALE') {
    uncertainties.push('ARTICLE_ANALYSIS_STALE');
    deepAnalysisReasons.push('STALE_ANALYSIS');
  }
  if (analysisConfidence === 'LOW') {
    deepAnalysisReasons.push('LOW_LIGHT_CONFIDENCE');
  }

  const deepAnalysisRecommended = deepAnalysisReasons.length > 0;

  return {
    version: 1,
    mode: 'light',
    methodVersion: 'article-light-v1',
    analyzedAt: normalizeAnalyzedAt(input.analyzedAt),
    contentHash: normalizeText(input.contentHash),
    supportLevel,
    sourceQualitySummary: {
      totalSources,
      usableSources,
      uniqueDomains,
      durableSourceCount,
      profiledSourceCount,
      metadataOnlyCount,
      unavailableCount,
      unknownSourceCount,
      profileCoverage,
    },
    sourceUsageSummary: {
      primaryEvidenceCount,
      officialStatementCount,
      contextCount,
      counterpointCount,
      backgroundCount,
      unknownRoleCount,
      hasPrimaryEvidence,
      domainDiversity: uniqueDomains >= 3 ? 'HIGH' : uniqueDomains >= 2 ? 'MEDIUM' : 'LOW',
    },
    limitations: unique(limitations),
    uncertainties: unique(uncertainties),
    analysisConfidence,
    deepAnalysisAvailable: true,
    deepAnalysisRecommended,
    requiresDeepAnalysis: deepAnalysisRecommended,
    deepAnalysisReasons: unique(deepAnalysisReasons),
  };
}

function deriveLightSupportLevel(input: {
  totalSources: number;
  usableSources: number;
  uniqueDomains: number;
  unknownSourceCount: number;
  profileCoverage: number;
  hasPrimaryEvidence: boolean;
  incompleteCount: number;
}): ArticleLightSupportLevel {
  if (input.usableSources === 0 || input.unknownSourceCount > input.totalSources / 2) {
    return 'unverified';
  }
  if (input.usableSources === 1 || input.uniqueDomains === 1) return 'fragile';
  if (
    input.uniqueDomains >= 3
    && input.hasPrimaryEvidence
    && input.profileCoverage >= 0.67
    && input.incompleteCount <= input.totalSources / 2
  ) {
    return 'strong';
  }
  if (input.uniqueDomains >= 2) return 'nuanced';
  return 'fragile';
}

function deriveAnalysisConfidence(input: {
  supportLevel: ArticleLightSupportLevel;
  usableSources: number;
  profileCoverage: number;
  unknownSourceCount: number;
  incompleteCount: number;
}): ArticleLightAnalysisConfidence {
  if (
    input.supportLevel === 'strong'
    && input.profileCoverage >= 0.8
    && input.unknownSourceCount === 0
    && input.incompleteCount === 0
  ) {
    return 'HIGH';
  }
  if (input.usableSources >= 2 && input.profileCoverage >= 0.5) return 'MEDIUM';
  return 'LOW';
}

function normalizeRelationSources(
  relations: Record<string, any>[],
  legacySources: Record<string, any>[],
): LightSource[] {
  const legacyByUrl = new Map<string, Record<string, any>>();
  for (const legacy of legacySources) {
    const key = normalizeUrl(legacy.url);
    if (key && !legacyByUrl.has(key)) legacyByUrl.set(key, legacy);
  }

  return relations.map((relation) => {
    const legacy = legacyByUrl.get(normalizeUrl(relation.sourceUrl) ?? '') ?? {};
    const snapshot = asObject(relation.profileSnapshot);
    const currentProfile = asObject(relation.currentProfile);
    const source = asObject(relation.source);
    const profileData = snapshot?.profileData
      ?? currentProfile?.profileData
      ?? source?.profileData
      ?? legacy.profileData;
    const confidence = snapshot?.profileConfidence
      ?? currentProfile?.profileConfidence
      ?? source?.profileConfidence
      ?? legacy.profileConfidence;
    const publicTrustLabel = snapshot?.publicTrustLabel
      ?? currentProfile?.publicTrustLabel
      ?? source?.publicTrustLabel
      ?? legacy.publicTrustLabel;

    return normalizeSource({
      ...legacy,
      ...relation,
      domain: relation.domain ?? source?.domain ?? legacy.domain,
      type: relation.type ?? source?.type ?? legacy.type,
      durableSourceId: relation.sourceId ?? relation.durableSourceId,
      profileData,
      profileConfidence: confidence,
      publicTrustLabel,
    });
  });
}

function normalizeLegacySource(source: Record<string, any>): LightSource {
  return normalizeSource(source);
}

function normalizeSource(source: Record<string, any>): LightSource {
  const domain = normalizeDomain(source.domain ?? source.url);
  const role = normalizeRole(source.role);
  const extractionStatus = normalizeText(source.extractionStatus)?.toLowerCase();
  const analysisStatus = normalizeText(source.analysisStatus)?.toUpperCase();
  const unavailable = extractionStatus === 'failed' || analysisStatus === 'UNAVAILABLE';
  const metadataOnly = extractionStatus === 'metadata_only' || analysisStatus === 'METADATA_ONLY';
  const profiled = hasUsableProfile(source.profileData)
    || normalizeText(source.profileConfidence) !== null
    || normalizeText(source.publicTrustLabel) !== null;
  const recognizedType = !['', 'UNKNOWN', 'GENERAL', 'PENDING', 'UNAVAILABLE']
    .includes((normalizeText(source.type) ?? '').toUpperCase());
  const durable = Boolean(normalizeText(source.durableSourceId));
  const unknown = !durable && !profiled && !recognizedType;
  const weakProfile = !profiled
    || normalizeText(source.profileConfidence)?.toUpperCase() === 'LOW'
    || ['fragile', 'unverified', 'unsourced'].includes(
      normalizeText(source.publicTrustLabel)?.toLowerCase() ?? '',
    );

  return {
    domain,
    role,
    durable,
    profiled,
    weakProfile,
    unknown,
    usable: Boolean(domain) && !unavailable,
    metadataOnly,
    unavailable,
  };
}

function readLegacySources(factCheckData: unknown): Record<string, any>[] {
  const data = asObject(factCheckData);
  return data ? asObjectArray(data.sources) : [];
}

function asObjectArray(value: unknown): Record<string, any>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, any> => Boolean(asObject(item)))
    : [];
}

function asObject(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function hasUsableProfile(value: unknown): boolean {
  const profile = asObject(value);
  return Boolean(profile && Object.keys(profile).length > 0);
}

function normalizeRole(value: unknown): SourceRole {
  const role = normalizeText(value)?.toUpperCase();
  return ['PRIMARY_EVIDENCE', 'CONTEXT', 'COUNTERPOINT', 'OFFICIAL_STATEMENT', 'BACKGROUND']
    .includes(role ?? '')
    ? role as SourceRole
    : 'UNKNOWN';
}

function normalizeDomain(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  try {
    return new URL(text.includes('://') ? text : `https://${text}`)
      .hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

function normalizeUrl(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeAnalyzedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '1970-01-01T00:00:00.000Z' : date.toISOString();
}

function countRole(sources: LightSource[], role: SourceRole): number {
  return sources.filter((source) => source.role === role).length;
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function buildErrorAnalysis(input: BuildArticleLightAnalysisInput): ArticleLightAnalysisV1 {
  return {
    version: 1,
    mode: 'light',
    methodVersion: 'article-light-v1',
    analyzedAt: normalizeAnalyzedAt(input.analyzedAt),
    contentHash: normalizeText(input.contentHash),
    supportLevel: 'unverified',
    sourceQualitySummary: {
      totalSources: 0,
      usableSources: 0,
      uniqueDomains: 0,
      durableSourceCount: 0,
      profiledSourceCount: 0,
      metadataOnlyCount: 0,
      unavailableCount: 0,
      unknownSourceCount: 0,
      profileCoverage: 0,
    },
    sourceUsageSummary: {
      primaryEvidenceCount: 0,
      officialStatementCount: 0,
      contextCount: 0,
      counterpointCount: 0,
      backgroundCount: 0,
      unknownRoleCount: 0,
      hasPrimaryEvidence: false,
      domainDiversity: 'LOW',
    },
    limitations: ['LIGHT_ANALYSIS_ERROR'],
    uncertainties: ['LIGHT_ANALYSIS_UNAVAILABLE'],
    analysisConfidence: 'LOW',
    deepAnalysisAvailable: true,
    deepAnalysisRecommended: true,
    requiresDeepAnalysis: true,
    deepAnalysisReasons: ['LIGHT_ANALYSIS_ERROR'],
  };
}
