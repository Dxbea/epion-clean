export type SourceMetricsLike = {
    transparency?: number;
    editorial?: number;
    semantic?: number;
    logic?: number;
    pluralism?: number;
    ux?: number;
} | null | undefined;

export type SourceScoreComponents = {
    reputationScore: number | null;
    analysisScore: number | null;
    finalScore: number | null;
};

function normalizeScore(score: unknown): number | null {
    return typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : null;
}

export function computeSourceAnalysisScore(metrics: SourceMetricsLike): number | null {
    if (!metrics) {
        return null;
    }

    const transparency = normalizeScore(metrics.transparency);
    const editorial = normalizeScore(metrics.editorial);
    const semantic = normalizeScore(metrics.semantic);
    const logic = normalizeScore(metrics.logic ?? metrics.pluralism ?? metrics.ux);

    if (
        transparency === null ||
        editorial === null ||
        semantic === null ||
        logic === null
    ) {
        return null;
    }

    return Math.round((transparency + editorial + semantic + logic) / 4);
}

export function computeSourceFactScore(input: {
    reputationScore?: number | null;
    analysisScore?: number | null;
}): SourceScoreComponents {
    const reputationScore = normalizeScore(input.reputationScore);
    const analysisScore = normalizeScore(input.analysisScore);

    if (reputationScore !== null && analysisScore !== null) {
        return {
            reputationScore,
            analysisScore,
            finalScore: Math.round((reputationScore * 0.7) + (analysisScore * 0.3)),
        };
    }

    if (reputationScore !== null) {
        return {
            reputationScore,
            analysisScore,
            finalScore: reputationScore,
        };
    }

    if (analysisScore !== null) {
        return {
            reputationScore,
            analysisScore,
            finalScore: analysisScore,
        };
    }

    return {
        reputationScore: null,
        analysisScore: null,
        finalScore: null,
    };
}
