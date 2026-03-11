/**
 * Live Analysis — Shared Types & Constants
 * Types used across the Perplexity investigator, GPT judge, and Mistral auditor.
 */

// Content Intent — determined by the Primary Judge based on the article's actual intention
export type ContentIntent = 'REPORT' | 'INVESTIGATION' | 'OPINION' | 'PROMO' | 'ACADEMIC';

// Pillar weights per Content Intent
export const INTENT_WEIGHTS: Record<ContentIntent, { transparency: number; editorial: number; semantic: number; logic: number }> = {
    REPORT: { transparency: 0.20, editorial: 0.30, semantic: 0.25, logic: 0.25 },
    INVESTIGATION: { transparency: 0.20, editorial: 0.40, semantic: 0.15, logic: 0.25 },
    OPINION: { transparency: 0.20, editorial: 0.20, semantic: 0.40, logic: 0.20 },
    PROMO: { transparency: 0.45, editorial: 0.25, semantic: 0.25, logic: 0.05 },
    ACADEMIC: { transparency: 0.20, editorial: 0.50, semantic: 0.15, logic: 0.15 },
};

export const VALID_INTENTS: ContentIntent[] = ['REPORT', 'INVESTIGATION', 'OPINION', 'PROMO', 'ACADEMIC'];

// Individual pillar score with evidence
export interface PillarScore {
    score: number;    // 0-100
    quote: string;    // Extract from article
    reasoning: string; // Justification
}

// Full judge verdict
export interface JudgeVerdict {
    contentIntent: ContentIntent;
    pillarScores: {
        transparency: PillarScore;
        editorial: PillarScore;
        semantic: PillarScore;
        logic: PillarScore;
    };
    globalScore: number; // Weighted average based on Intent
}

// Fact-check context from Perplexity investigator
export interface FactCheckContext {
    claimsVerified: { claim: string; verified: boolean; context: string }[];
    counterArguments: { point: string; source: string }[];
    missingContext: { stat: string; fullContext: string }[];
}

// Final result from the full pipeline
export interface LiveAnalysisResult {
    contentIntent: ContentIntent;
    pillarScores: {
        transparency: PillarScore;
        editorial: PillarScore;
        semantic: PillarScore;
        logic: PillarScore;
    };
    globalScore: number; // Final ScoreLiveBrut
    judges: {
        primary: JudgeVerdict;
        auditor: JudgeVerdict;
    };
}

/**
 * Calculate weighted global score from pillar scores and Content Intent.
 */
export function calculateWeightedScore(
    pillarScores: { transparency: PillarScore; editorial: PillarScore; semantic: PillarScore; logic: PillarScore },
    intent: ContentIntent
): number {
    const weights = INTENT_WEIGHTS[intent];
    const raw = (
        pillarScores.transparency.score * weights.transparency +
        pillarScores.editorial.score * weights.editorial +
        pillarScores.semantic.score * weights.semantic +
        pillarScores.logic.score * weights.logic
    );
    return Math.min(100, Math.max(0, Math.round(raw)));
}
