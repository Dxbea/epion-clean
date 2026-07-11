/**
 * source-ui.ts — Source normalization for UI display
 *
 * This module normalizes raw source objects (from backend) into a consistent
 * shape for UI components. It does NOT recalculate scores — it reads
 * the trustScore provided by the backend.
 */

type RawSourceLike = Record<string, any>;

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
        country: source.metadata?.country || source.country || 'FR',
        politicalBias: source.metadata?.politicalBias || source.politicalBias || 'UNKNOWN',
        reliability: source.metadata?.reliability || source.reliability || undefined,
        biasScore: source.metadata?.biasScore || source.biasScore || undefined,
        explanation: source.explanation || source.metadata?.explanation || DEFAULT_EXPLANATION,
        description: source.description || source.metadata?.description || fallbackDescription,
        type: source.type || source.category || 'GENERAL',
        category: source.category || source.type || 'GENERAL',
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
