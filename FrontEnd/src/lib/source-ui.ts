import { computeSourceAnalysisScore, computeSourceFactScore } from './source-score';

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

export function normalizeSourceForUi(
    source: RawSourceLike,
    fallbackDescription: string,
) {
    const domain = resolveSourceDomain(source);
    const trustScore = typeof source.trustScore === 'number'
        ? source.trustScore
        : typeof source.metadata?.dbScore === 'number'
            ? source.metadata.dbScore
            : typeof source.dbScore === 'number'
                ? source.dbScore
                : typeof source.score === 'number'
                    ? source.score
                    : null;

    const metrics = source.metrics || source.metric
        ? {
            ...(source.metrics || source.metric),
            logic: (source.metrics || source.metric).logic || (source.metrics || source.metric).pluralism || (source.metrics || source.metric).ux || 50,
        }
        : undefined;

    const analysisScore = computeSourceAnalysisScore(metrics);
    const scoreComponents = computeSourceFactScore({
        reputationScore: typeof source.metadata?.dbScore === 'number'
            ? source.metadata.dbScore
            : typeof source.dbScore === 'number'
                ? source.dbScore
                : trustScore,
        analysisScore,
    });

    return {
        ...source,
        domain,
        name: domain,
        url: source.url || source.link || '#',
        score: scoreComponents.finalScore,
        trustScore,
        dbScore: scoreComponents.reputationScore || undefined,
        analysisScore: scoreComponents.analysisScore,
        reputationScore: scoreComponents.reputationScore,
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
