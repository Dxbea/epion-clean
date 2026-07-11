import type { StructuredArticleContent } from '../../types/structured-article.js';
import type {
    ArticleSourceProvenanceValue,
    ArticleSourceRoleValue,
} from '../article-source-service.js';

/**
 * Live Analysis - Shared Types & Constants
 *
 * Types used across the Smart Router, Serper investigator, GPT judge, and Mistral auditor.
 */

export type ContentIntent = 'REPORT' | 'INVESTIGATION' | 'OPINION' | 'PROMO' | 'ACADEMIC';

export const INTENT_WEIGHTS: Record<ContentIntent, { transparency: number; editorial: number; semantic: number; logic: number }> = {
    REPORT: { transparency: 0.20, editorial: 0.30, semantic: 0.25, logic: 0.25 },
    INVESTIGATION: { transparency: 0.20, editorial: 0.40, semantic: 0.15, logic: 0.25 },
    OPINION: { transparency: 0.20, editorial: 0.20, semantic: 0.40, logic: 0.20 },
    PROMO: { transparency: 0.45, editorial: 0.25, semantic: 0.25, logic: 0.05 },
    ACADEMIC: { transparency: 0.20, editorial: 0.50, semantic: 0.15, logic: 0.15 },
};

export const VALID_INTENTS: ContentIntent[] = ['REPORT', 'INVESTIGATION', 'OPINION', 'PROMO', 'ACADEMIC'];

export const DISARM_TECHNIQUES = {
    T0081: 'Cadrage emotionnel (Emotional Framing)',
    T0042: 'Homme de paille (Straw Man)',
    T0039: 'Cherry-picking (Selection biaisee de donnees)',
    T0048: 'Appel a la peur (Fear-mongering)',
    T0049: "Appel a l'autorite (sans expertise)",
    T0046: 'Faux dilemme (False Dichotomy)',
    T0044: 'Generalisation abusive (Hasty Generalization)',
    T0087: 'Amplification de statistiques hors contexte',
    T0085: 'Titre trompeur (Misleading Headline)',
    T0082: 'Victimisation strategique',
} as const;

export type DisarmCode = keyof typeof DISARM_TECHNIQUES;
export type SourceSearchLane = 'FACTUAL' | 'CRITICAL' | 'CONTEXTUAL';

export interface FactCheckSource {
    sourceId?: string;
    url: string;
    title: string;
    content: string;
    metaDescription?: string;
    publishedDate?: string;
    domain: string;
    score: number;
    provider?: 'web' | 'rag';
    searchLane?: SourceSearchLane;
    role?: ArticleSourceRoleValue;
    provenance?: ArticleSourceProvenanceValue;
    officialStatement?: boolean;
    extractionStatus?: 'full' | 'metadata_only';
    sourceQuality?: 'full' | 'metadata_only';
    extractionFailureReason?: string;
    articleSlug?: string;
}

export interface RoutingDecision {
    route: 'HOT_NEWS' | 'COLD_INVESTIGATION' | 'MIXED';
    query_factual: string;
    query_critical: string;
    query_contextual: string;
}

export interface FactCheckContext {
    sources: FactCheckSource[];
    routingDecision: RoutingDecision;
}

export interface PillarScore {
    score: number;
    quote: string;
    reasoning: string;
    disarmCodes?: DisarmCode[];
}

export interface GeneratedContent {
    title: string;
    summary: string;
    content: string;
    structuredContent?: StructuredArticleContent | null;
    opinionQuestion?: {
        question: string;
        thesisA: string;
        thesisB: string;
    } | null;
    tags: string[];
    imagePrompt: string | null;
    wikipedia_search_query: string | null;
}

export interface JudgeVerdict {
    contentIntent: ContentIntent;
    pillarScores: {
        transparency: PillarScore;
        editorial: PillarScore;
        semantic: PillarScore;
        logic: PillarScore;
    };
    globalScore: number;
    generatedContent?: GeneratedContent;
}

export interface LiveAnalysisResult {
    contentIntent: ContentIntent;
    pillarScores: {
        transparency: PillarScore;
        editorial: PillarScore;
        semantic: PillarScore;
        logic: PillarScore;
    };
    globalScore: number;
    judges: {
        primary: JudgeVerdict;
        auditor: JudgeVerdict;
    };
    generatedContent?: GeneratedContent;
    sources?: FactCheckSource[];
}

export function calculateWeightedScore(
    pillarScores: { transparency: PillarScore; editorial: PillarScore; semantic: PillarScore; logic: PillarScore },
    intent: ContentIntent,
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

export function formatSourcesForPrompt(sources: FactCheckSource[], maxCharsPerSource = 1500): string {
    if (sources.length === 0) {
        return '[Aucune source trouvee]';
    }

    return sources.map((source, index) => {
        const content = source.content.length > maxCharsPerSource
            ? `${source.content.slice(0, maxCharsPerSource)}\n[... tronque ...]`
            : source.content;
        const date = source.publishedDate ? ` | ${source.publishedDate}` : '';
        const id = source.sourceId || `source_${index + 1}`;
        const qualityLabel = source.extractionStatus === 'metadata_only'
            ? ' | METADATA ONLY - limited Serper snippet, full page extraction failed'
            : '';
        return `[Source ${index + 1} | id=${id}${qualityLabel}] ${source.title} (${source.domain}${date})\nURL: ${source.url}\n${content}`;
    }).join('\n\n---\n\n');
}
