import { getRichTrustScore } from './trust-score';
import { logger } from './logger';
import type { WebSearchSource } from './web-chat';

export interface ChatTransparencySource {
    id: number;
    name: string;
    domain: string;
    url: string;
    logo: string;
    category: string;
    type: string;
    score: number;
    trustScore: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    description?: string | null;
    justification?: string | null;
    metrics?: {
        transparency: number;
        editorial: number;
        semantic: number;
        logic: number;
    };
    flags?: {
        isPlatform?: boolean;
        hasFactCheckFailures?: boolean;
        isAdsTxtValid?: boolean;
        isOwnerPublic?: boolean;
    };
    dbScore: number;
    country?: string;
    politicalBias?: string;
    biasScore?: number;
    reliability?: string;
    explanation?: {
        formula: string;
        range: string;
        qualityCursor: string;
        penalties: string[];
    };
    metadata: {
        provider: 'serper' | 'rag';
        publishedDate?: string;
        searchScore: number;
        dbScore: number;
        politicalBias?: string;
        biasScore?: number;
        reliability?: string;
        country?: string;
        type?: string;
        explanation?: {
            formula: string;
            range: string;
            qualityCursor: string;
            penalties: string[];
        };
        articleSlug?: string;
        sourceName?: string;
    };
}

function computeConfidence(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (score >= 80) return 'HIGH';
    if (score >= 60) return 'MEDIUM';
    return 'LOW';
}

function buildFallbackSource(source: WebSearchSource, index: number): ChatTransparencySource {
    const searchScore = Math.max(30, Math.min(100, Math.round(source.score * 100)));
    const provider = source.provider === 'rag' ? 'rag' : 'serper';
    const category = source.provider === 'rag' ? 'DATABASE' : 'MEDIA';

    return {
        id: index + 1,
        name: source.title || source.domain,
        domain: source.domain,
        url: source.url,
        logo: source.favicon || `https://www.google.com/s2/favicons?domain=${source.domain}&sz=64`,
        category,
        type: category,
        score: searchScore,
        trustScore: searchScore,
        confidence: computeConfidence(searchScore),
        description: source.content.slice(0, 220) || null,
        justification: provider === 'rag'
            ? `Source interne Epion issue du RAG, rattachee au media ${source.domain}.`
            : `Source web issue de Serper sur ${source.domain}.`,
        dbScore: searchScore,
        country: 'FR',
        politicalBias: 'UNKNOWN',
        reliability: 'UNKNOWN',
        metadata: {
            provider,
            publishedDate: source.publishedDate,
            searchScore: source.score,
            dbScore: searchScore,
            articleSlug: source.articleSlug,
            type: category,
        },
    };
}

export async function enrichChatSources(
    sources: WebSearchSource[],
): Promise<{ sources: ChatTransparencySource[]; sourcesMean: number }> {
    if (sources.length === 0) {
        return { sources: [], sourcesMean: 0 };
    }

    const trustScoreByDomain = new Map<string, Promise<any>>();

    const enriched = await Promise.all(
        sources.map(async (source, index) => {
            try {
                let trustScorePromise = trustScoreByDomain.get(source.domain);
                if (!trustScorePromise) {
                    trustScorePromise = getRichTrustScore(source.domain);
                    trustScoreByDomain.set(source.domain, trustScorePromise);
                }
                const trustScore = await trustScorePromise;

                const category = trustScore.metadata.type || (source.provider === 'rag' ? 'DATABASE' : 'MEDIA');
                const provider = source.provider === 'rag' ? 'rag' : 'serper';
                const sourceScore = trustScore.globalScore;

                return {
                    id: index + 1,
                    name: source.title || trustScore.metadata.name || source.domain,
                    domain: source.domain,
                    url: source.url,
                    logo: source.favicon || `https://www.google.com/s2/favicons?domain=${source.domain}&sz=64`,
                    category,
                    type: category,
                    score: sourceScore,
                    trustScore: sourceScore,
                    confidence: computeConfidence(sourceScore),
                    description: trustScore.metadata.description || source.content.slice(0, 220) || null,
                    justification: trustScore.metadata.justification || null,
                    metrics: {
                        transparency: trustScore.details.transparency,
                        editorial: trustScore.details.editorial,
                        semantic: trustScore.details.semantic,
                        logic: trustScore.details.pluralism,
                    },
                    flags: {
                        isPlatform: trustScore.flags.isPlatform,
                        hasFactCheckFailures: trustScore.flags.hasFactCheckFailures,
                        isAdsTxtValid: trustScore.flags.isAdsTxtValid,
                        isOwnerPublic: trustScore.flags.isOwnerPublic,
                    },
                    dbScore: trustScore.globalScore,
                    country: trustScore.metadata.country,
                    politicalBias: trustScore.metadata.politicalBias,
                    biasScore: trustScore.metadata.biasScore,
                    reliability: trustScore.metadata.reliability,
                    explanation: trustScore.metadata.explanation,
                    metadata: {
                        provider,
                        publishedDate: source.publishedDate,
                        searchScore: source.score,
                        dbScore: trustScore.globalScore,
                        politicalBias: trustScore.metadata.politicalBias,
                        biasScore: trustScore.metadata.biasScore,
                        reliability: trustScore.metadata.reliability,
                        country: trustScore.metadata.country,
                        type: trustScore.metadata.type,
                        explanation: trustScore.metadata.explanation,
                        articleSlug: source.articleSlug,
                        sourceName: trustScore.metadata.name,
                    },
                } satisfies ChatTransparencySource;
            } catch (error: unknown) {
                logger.warn('Chat source enrichment failed, using fallback metadata', {
                    module: 'ChatSourceEnrichment',
                    domain: source.domain,
                    url: source.url,
                    error: error instanceof Error ? error.message : 'Unknown trust-score error',
                });

                return buildFallbackSource(source, index);
            }
        }),
    );

    const validScores = enriched
        .map((source) => source.trustScore)
        .filter((score) => typeof score === 'number' && Number.isFinite(score));

    const sourcesMean = validScores.length > 0
        ? Math.round(validScores.reduce((sum, score) => sum + score, 0) / validScores.length)
        : 0;

    logger.info('Chat source enrichment complete', {
        module: 'ChatSourceEnrichment',
        sourceCount: enriched.length,
        sourcesMean,
        domains: enriched.map((source) => source.domain),
    });

    return {
        sources: enriched,
        sourcesMean,
    };
}
