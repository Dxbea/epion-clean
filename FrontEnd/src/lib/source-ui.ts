/**
 * source-ui.ts — Source normalization for UI display
 *
 * This module normalizes raw source objects (from backend) into a consistent
 * shape for UI components. It does NOT recalculate scores — it reads
 * the trustScore provided by the backend.
 */

type RawSourceLike = Record<string, any>;

const PUBLIC_SOURCE_TYPE_LABELS: Record<string, string> = {
    COMMERCIAL: 'Source commerciale',
    MEDIA: 'Média',
    PRESSE: 'Média',
    OFFICIAL: 'Source officielle',
    OFFICIEL: 'Source officielle',
    GOVERNMENT: 'Source officielle',
    GOUV: 'Source officielle',
    SOCIAL: 'Réseau social',
    RÉSEAU: 'Réseau social',
    ACADEMIC: 'Source académique',
    ACADEMIQUE: 'Source académique',
    SCIENCE: 'Source académique',
};

const PUBLIC_SOURCE_ROLE_LABELS: Record<string, string> = {
    EVIDENCE: 'Source d’appui',
    PROOF: 'Source d’appui',
    SUPPORTING: 'Source d’appui',
    SUPPORT: 'Source d’appui',
    CONTEXT: 'Source de contexte',
    BACKGROUND: 'Source de contexte',
    COUNTERPOINT: 'Source contradictoire',
    OPPOSITION: 'Source contradictoire',
    CONTRADICTION: 'Source contradictoire',
    QUOTE: 'Citation ou déclaration',
    DATA: 'Données ou chiffres',
};

const PUBLIC_CONTENT_INTENT_LABELS: Record<string, string> = {
    REPORT: 'Analyse fondée sur le contenu de l’article et ses sources.',
    NEWS: 'Analyse fondée sur un contenu d’actualité et ses sources.',
    OPINION: 'Analyse d’un contenu présentant un point de vue.',
};

export type StructuredSourceReference = {
    label: string;
    url?: string;
};

export type StructuredSourceProfile = {
    countryLabel?: string;
    typeLabel?: string;
    description?: string;
    roleLabel?: string;
    strengths: string[];
    warnings: string[];
    references: StructuredSourceReference[];
    analyzedAtLabel?: string;
};

function normalizePublicKey(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    return value.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function readFirstString(...values: unknown[]): string | undefined {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
}

function readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanDisplayText(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const cleaned = value.replace(/\[\d+\]/g, '').trim();
    return cleaned || undefined;
}

function countryToPublicLabel(country: unknown): string | undefined {
    const rawCountry = readFirstString(country);
    if (!rawCountry) return undefined;
    const countryKey = rawCountry.toUpperCase();
    if (countryKey === 'FR') return 'France';
    if (countryKey === 'US' || countryKey === 'USA') return 'USA';
    return rawCountry;
}

function formatDateLabel(value: unknown): string | undefined {
    const rawDate = readFirstString(value);
    if (!rawDate) return undefined;
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return undefined;
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function collectListValues(...values: unknown[]): string[] {
    const items = values.flatMap((value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') return [value];
        if (value && typeof value === 'object') {
            const record = value as Record<string, unknown>;
            return [
                record.items,
                record.values,
                record.points,
                record.signals,
                record.list,
                record.entries,
            ].flatMap((nestedValue) => Array.isArray(nestedValue) ? nestedValue : []);
        }
        return [];
    });

    return Array.from(new Set(items
        .map((item) => {
            if (typeof item === 'string') return cleanDisplayText(item);
            if (item && typeof item === 'object') {
                const record = item as Record<string, unknown>;
                return cleanDisplayText(record.label)
                    ?? cleanDisplayText(record.title)
                    ?? cleanDisplayText(record.text)
                    ?? cleanDisplayText(record.description)
                    ?? cleanDisplayText(record.reason);
            }
            return undefined;
        })
        .filter((item): item is string => Boolean(item))));
}

function collectReferences(...values: unknown[]): StructuredSourceReference[] {
    const rawItems = values.flatMap((value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') return [value];
        if (value && typeof value === 'object') {
            const record = value as Record<string, unknown>;
            return [
                record.items,
                record.values,
                record.references,
                record.sources,
                record.links,
                record.entries,
            ].flatMap((nestedValue) => Array.isArray(nestedValue) ? nestedValue : []);
        }
        return [];
    });

    const references = rawItems
        .map((item): StructuredSourceReference | null => {
            if (typeof item === 'string') {
                const label = cleanDisplayText(item);
                return label ? { label } : null;
            }

            if (!item || typeof item !== 'object') return null;

            const record = item as Record<string, unknown>;
            const label = cleanDisplayText(record.label)
                ?? cleanDisplayText(record.title)
                ?? cleanDisplayText(record.name)
                ?? cleanDisplayText(record.source)
                ?? cleanDisplayText(record.url);

            if (!label) return null;

            const url = readFirstString(record.url, record.href, record.link);
            return url ? { label, url } : { label };
        })
        .filter((item): item is StructuredSourceReference => Boolean(item));

    return references.filter((reference, index, all) => (
        all.findIndex((candidate) => candidate.label === reference.label && candidate.url === reference.url) === index
    ));
}

export function formatPublicSourceType(type: unknown): string | null {
    const typeKey = normalizePublicKey(type);
    if (!typeKey || typeKey === 'UNKNOWN') return null;
    return PUBLIC_SOURCE_TYPE_LABELS[typeKey] ?? null;
}

export function getPublicSourceTypeLabel(type: unknown): string | null {
    return formatPublicSourceType(type);
}

export function formatSourceRoleLabel(role: unknown): string | null {
    const roleKey = normalizePublicKey(role);
    if (!roleKey || roleKey === 'UNKNOWN') return null;
    return PUBLIC_SOURCE_ROLE_LABELS[roleKey] ?? null;
}

export function formatAnalysisIntentLabel(intent: unknown): string | null {
    const intentKey = normalizePublicKey(intent);
    if (!intentKey) return null;
    return PUBLIC_CONTENT_INTENT_LABELS[intentKey] ?? null;
}

export function getPublicContentIntentLabel(intent: unknown): string | null {
    return formatAnalysisIntentLabel(intent);
}

export function extractStructuredSourceProfile(source: RawSourceLike): StructuredSourceProfile {
    const metadata = readRecord(source?.metadata);
    const profile = readRecord(source?.profile);
    const profileData = readRecord(source?.profileData ?? metadata.profileData ?? profile.profileData);
    const sourceProfile = readRecord(source?.sourceProfile ?? metadata.sourceProfile);
    const reputation = readRecord(source?.reputation ?? metadata.reputation ?? profileData.reputation);
    const externalReputation = readRecord(source?.externalReputation ?? metadata.externalReputation ?? profileData.externalReputation);
    const audit = readRecord(source?.audit ?? metadata.audit ?? profileData.audit);

    return {
        countryLabel: countryToPublicLabel(source.country ?? metadata.country ?? profile.country ?? profileData.country ?? sourceProfile.country),
        typeLabel: formatPublicSourceType(source.category ?? source.type ?? metadata.type ?? metadata.category ?? profile.type ?? profileData.type ?? sourceProfile.type) ?? undefined,
        description: cleanDisplayText(source.description)
            ?? cleanDisplayText(metadata.description)
            ?? cleanDisplayText(profile.description)
            ?? cleanDisplayText(profileData.description)
            ?? cleanDisplayText(sourceProfile.description),
        roleLabel: formatSourceRoleLabel(
            source.role
            ?? source.articleRole
            ?? source.sourceRole
            ?? source.supportRole
            ?? source.relation
            ?? metadata.role
            ?? metadata.sourceRole
            ?? metadata.supportRole
            ?? profile.role
            ?? profileData.role
            ?? profileData.sourceRole
            ?? profileData.supportRole
            ?? sourceProfile.role
        ) ?? undefined,
        strengths: collectListValues(
            source.strengths,
            source.positiveSignals,
            source.favorableElements,
            metadata.strengths,
            metadata.positiveSignals,
            profile.strengths,
            profileData.strengths,
            profileData.positiveSignals,
            profileData.favorableElements,
            sourceProfile.strengths,
            reputation.strengths
        ),
        warnings: collectListValues(
            source.warnings,
            source.criticisms,
            source.limitations,
            source.risks,
            source.negativeSignals,
            metadata.warnings,
            metadata.criticisms,
            metadata.limitations,
            metadata.risks,
            profile.warnings,
            profile.criticisms,
            profile.limitations,
            profileData.warnings,
            profileData.criticisms,
            profileData.limitations,
            profileData.risks,
            profileData.negativeSignals,
            sourceProfile.warnings,
            sourceProfile.criticisms,
            sourceProfile.limitations,
            reputation.warnings,
            reputation.criticisms,
            reputation.limitations,
            externalReputation.warnings,
            externalReputation.criticisms,
            externalReputation.limitations
        ),
        references: collectReferences(
            source.references,
            source.externalReferences,
            source.reputationReferences,
            metadata.references,
            metadata.externalReferences,
            metadata.reputationReferences,
            profile.references,
            profile.externalReferences,
            profileData.references,
            profileData.externalReferences,
            profileData.reputationReferences,
            sourceProfile.references,
            reputation.references,
            externalReputation.references,
            audit.references
        ),
        analyzedAtLabel: formatDateLabel(
            source.lastAnalyzedAt
            ?? source.lastAuditDate
            ?? source.lastProfiledAt
            ?? source.profiledAt
            ?? source.analyzedAt
            ?? metadata.lastAnalyzedAt
            ?? metadata.lastAuditDate
            ?? metadata.lastProfiledAt
            ?? metadata.profiledAt
            ?? metadata.analyzedAt
            ?? profileData.lastAnalyzedAt
            ?? profileData.lastAuditDate
            ?? profileData.lastProfiledAt
            ?? profileData.profiledAt
            ?? profileData.analyzedAt
            ?? audit.lastAuditDate
            ?? audit.analyzedAt
        ),
    };
}

const DEFAULT_FLAGS = {
    isAdsTxtValid: true,
    isClickbait: false,
    isPlatform: false,
};

const DEFAULT_EXPLANATION = {
    formula: '70% Base de donnees + 30% Analyse Live',
    sources: ['Audit Epion (Legacy)'],
    livePenalties: [],
    pillarWeights: { transparency: '20%', editorial: '30%', semantic: '30%', pluralism: '20%' },
};

export function resolveSourceDomain(source: RawSourceLike): string {
    if (typeof source?.domain === 'string' && source.domain.trim()) return source.domain.trim();
    if (typeof source?.name === 'string' && source.name.trim()) return source.name.trim();
    if (typeof source?.url === 'string' && source.url.trim()) {
        try {
            return new URL(source.url).hostname.replace(/^www\./, '');
        } catch {
            return source.url;
        }
    }
    return 'Source inconnue';
}

/**
 * Resolve the trustScore from various possible field locations.
 * Priority: trustScore → metadata.dbScore → dbScore → score
 */
function resolveTrustScore(source: RawSourceLike): number | null {
    if (typeof source.trustScore === 'number') return source.trustScore;
    if (typeof source.metadata?.dbScore === 'number') return source.metadata.dbScore;
    if (typeof source.dbScore === 'number') return source.dbScore;
    if (typeof source.score === 'number') return source.score;
    return null;
}

/**
 * Normalize a raw source object into a consistent shape for UI display.
 *
 * The score displayed is the backend-computed trustScore.
 * No client-side recalculation is performed.
 */
export function normalizeSourceForUi(
    source: RawSourceLike,
    fallbackDescription: string,
) {
    const domain = resolveSourceDomain(source);
    const trustScore = resolveTrustScore(source);
    const metrics = source.metrics || source.metric || undefined;

    return {
        ...source,
        domain,
        name: domain,
        url: source.url || source.link || '#',
        // Score = backend trustScore (no client-side recalculation)
        score: trustScore,
        trustScore,
        dbScore: trustScore ?? undefined,
        country: source.metadata?.country || source.country || undefined,
        politicalBias: source.metadata?.politicalBias || source.politicalBias || undefined,
        reliability: source.metadata?.reliability || source.reliability || undefined,
        biasScore: source.metadata?.biasScore || source.biasScore || undefined,
        explanation: source.explanation || source.metadata?.explanation || DEFAULT_EXPLANATION,
        description: source.description || source.metadata?.description || fallbackDescription,
        type: source.type || source.category || undefined,
        category: source.category || source.type || undefined,
        logo: source.logo || `https://www.google.com/s2/favicons?domain=${domain !== 'Source inconnue' ? domain : 'example.com'}`,
        flags: source.flags || DEFAULT_FLAGS,
        metric: metrics,
        metrics,
    };
}

export function parsePotentialSources(input: unknown): RawSourceLike[] {
    let potentialSources = input;

    if (potentialSources && !Array.isArray(potentialSources) && typeof potentialSources === 'object') {
        const nestedSources = (potentialSources as Record<string, unknown>).sources;
        if (nestedSources) {
            potentialSources = nestedSources;
        }
    }

    try {
        if (Array.isArray(potentialSources)) {
            return potentialSources as RawSourceLike[];
        }

        if (typeof potentialSources === 'string') {
            if (potentialSources.trim() === '[]') {
                return [];
            }
            return JSON.parse(potentialSources) as RawSourceLike[];
        }
    } catch {
        return [];
    }

    return [];
}

export type SourceAnalysisStatus = 'ANALYZED' | 'METADATA_ONLY' | 'UNAVAILABLE' | 'PENDING';

const SOURCE_ANALYSIS_LABELS: Record<SourceAnalysisStatus, { fr: string; en: string }> = {
    ANALYZED: { fr: '', en: '' },
    METADATA_ONLY: { fr: 'M\u00e9tadonn\u00e9es seules', en: 'Metadata only' },
    UNAVAILABLE: { fr: 'Indisponible', en: 'Unavailable' },
    PENDING: { fr: 'Analyse en cours...', en: 'Analysis in progress...' },
};

function readSourceAnalysisStatus(source: RawSourceLike): SourceAnalysisStatus | null {
    const status = typeof source?.analysisStatus === 'string' ? source.analysisStatus.toUpperCase() : '';
    return status in SOURCE_ANALYSIS_LABELS ? status as SourceAnalysisStatus : null;
}

export function isSourceAnalysisPending(source: RawSourceLike): boolean {
    const status = readSourceAnalysisStatus(source);
    if (status) return status === 'PENDING';

    const score = typeof source?.score === 'number'
        ? source.score
        : typeof source?.trustScore === 'number'
            ? source.trustScore
            : null;

    return source?.isEnriching === true || score === null || source?.type === 'PENDING';
}

export function getSourceAnalysisLabel(source: RawSourceLike, lang: 'fr' | 'en' = 'fr'): string | null {
    const status = readSourceAnalysisStatus(source);
    if (!status || status === 'ANALYZED') return null;
    return SOURCE_ANALYSIS_LABELS[status][lang];
}
