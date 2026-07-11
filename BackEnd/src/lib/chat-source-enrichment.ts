import { getRichTrustScore } from './trust-score.js';
import { logger } from './logger.js';
import type { WebSearchSource } from './web-chat.js';
import type { PublicTrustLabelKey, SourceProfileConfidence, SourceProfileDataV1 } from './source-profile.js';

const DEFAULT_ENRICHMENT_CONCURRENCY = 6;
const DEFAULT_ENRICHMENT_TIMEOUT_MS = 80_000;

class EnrichmentTimeoutError extends Error {
    constructor(message = 'Chat source enrichment timed out') {
        super(message);
        this.name = 'EnrichmentTimeoutError';
    }
}

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
    profileData?: SourceProfileDataV1 | null;
    profileVersion?: number | null;
    profileConfidence?: SourceProfileConfidence | null;
    lastProfiledAt?: string | null;
    publicTrustLabel?: PublicTrustLabelKey | null;
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
    country?: string | null;
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
        country?: string | null;
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

function normalizeDomainKey(domain: string): string {
    return domain.trim().toLowerCase().replace(/^www\./, '');
}

function buildFallbackSource(
    source: WebSearchSource,
    index: number,
    reason: 'timeout' | 'error' = 'error',
): ChatTransparencySource {
    const provider = source.provider === 'rag' ? 'rag' : 'serper';
    const category = source.provider === 'rag' ? 'DATABASE' : 'MEDIA';
    const fallbackScore = 50;
    const fallbackReason = reason === 'timeout'
        ? "Analyse interrompue faute de temps exploitable."
        : "Analyse indisponible faute d'analyse exploitable.";
    const finalBio = source.metaDescription || "Media independant en cours d'analyse.";

    return {
        id: index + 1,
        name: source.title || source.domain,
        domain: source.domain,
        url: source.url,
        logo: source.favicon || `https://www.google.com/s2/favicons?domain=${source.domain}&sz=64`,
        category,
        type: category,
        score: fallbackScore,
        trustScore: fallbackScore,
        confidence: computeConfidence(fallbackScore),
        description: finalBio,
        justification: provider === 'rag'
            ? `${fallbackReason} Source interne Epion issue du RAG, rattachee au media ${source.domain}.`
            : `${fallbackReason} Source web issue de Serper sur ${source.domain}.`,
        profileData: null,
        profileVersion: null,
        profileConfidence: null,
        lastProfiledAt: null,
        publicTrustLabel: null,
        dbScore: fallbackScore,
        country: 'FR',
        politicalBias: 'UNKNOWN',
        reliability: 'UNKNOWN',
        metadata: {
            provider,
            publishedDate: source.publishedDate,
            searchScore: source.score,
            dbScore: fallbackScore,
            articleSlug: source.articleSlug,
            type: category,
        },
    };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return Promise.reject(new EnrichmentTimeoutError());
    }

    return new Promise<T>((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
            reject(new EnrichmentTimeoutError(`Chat source enrichment timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        promise.then(
            (value) => {
                clearTimeout(timeoutHandle);
                resolve(value);
            },
            (error) => {
                clearTimeout(timeoutHandle);
                reject(error);
            },
        );
    });
}

function prioritizeSourceIndexes(
    sources: WebSearchSource[],
    priorityDomains: string[],
): number[] {
    if (priorityDomains.length === 0) {
        return sources.map((_, index) => index);
    }

    const prioritySet = new Set(priorityDomains.map(normalizeDomainKey));

    return sources
        .map((_, index) => index)
        .sort((leftIndex, rightIndex) => {
            const leftPriority = prioritySet.has(normalizeDomainKey(sources[leftIndex].domain));
            const rightPriority = prioritySet.has(normalizeDomainKey(sources[rightIndex].domain));

            if (leftPriority === rightPriority) {
                return leftIndex - rightIndex;
            }

            return leftPriority ? -1 : 1;
        });
}

function buildEnrichedSource(source: WebSearchSource, index: number, trustScore: Awaited<ReturnType<typeof getRichTrustScore>>): ChatTransparencySource {
    const category = trustScore.metadata.type || (source.provider === 'rag' ? 'DATABASE' : 'MEDIA');
    const provider = source.provider === 'rag' ? 'rag' : 'serper';
    const sourceScore = trustScore.globalScore;
    const finalBio = source.metaDescription || trustScore.metadata.description || "Media en cours d'analyse.";

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
        description: finalBio,
        justification: trustScore.metadata.justification || null,
        profileData: trustScore.profileData,
        profileVersion: trustScore.profileVersion,
        profileConfidence: trustScore.profileConfidence,
        lastProfiledAt: trustScore.lastProfiledAt,
        publicTrustLabel: trustScore.publicTrustLabel,
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
}

interface EnrichChatSourcesOptions {
    maxConcurrent?: number;
    timeoutMs?: number;
    priorityDomains?: string[];
    onSourceEnriched?: (source: ChatTransparencySource) => void;
}

export async function enrichChatSources(
    sources: WebSearchSource[],
    options: EnrichChatSourcesOptions = {},
): Promise<{ sources: ChatTransparencySource[]; sourcesMean: number }> {
    if (sources.length === 0) {
        return { sources: [], sourcesMean: 0 };
    }

    const maxConcurrent = Math.max(1, options.maxConcurrent ?? DEFAULT_ENRICHMENT_CONCURRENCY);
    const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_ENRICHMENT_TIMEOUT_MS);
    const deadlineAt = Date.now() + timeoutMs;
    const orderedIndexes = prioritizeSourceIndexes(sources, options.priorityDomains ?? []);
    const trustScoreByDomain = new Map<string, Promise<any>>();
    const enriched = new Array<ChatTransparencySource | undefined>(sources.length);
    let nextQueueIndex = 0;

    const workers = Array.from({ length: Math.min(maxConcurrent, orderedIndexes.length) }, async () => {
        while (true) {
            const queueIndex = nextQueueIndex++;
            if (queueIndex >= orderedIndexes.length) {
                return;
            }

            const sourceIndex = orderedIndexes[queueIndex];
            const source = sources[sourceIndex];
            const remainingMs = deadlineAt - Date.now();

            if (remainingMs <= 0) {
                return;
            }

            try {
                let trustScorePromise = trustScoreByDomain.get(source.domain);
                if (!trustScorePromise) {
                    trustScorePromise = getRichTrustScore(source.domain, source.url, {
                        content: source.content,
                        metaDescription: source.metaDescription,
                    });
                    trustScoreByDomain.set(source.domain, trustScorePromise);
                }
                const trustScore = await withTimeout(trustScorePromise, remainingMs);
                const enrichedSource = buildEnrichedSource(source, sourceIndex, trustScore);
                enriched[sourceIndex] = enrichedSource;
                options.onSourceEnriched?.(enrichedSource);
            } catch (error: unknown) {
                const reason = error instanceof EnrichmentTimeoutError ? 'timeout' : 'error';
                logger.warn('Chat source enrichment failed, using fallback metadata', {
                    module: 'ChatSourceEnrichment',
                    domain: source.domain,
                    url: source.url,
                    reason,
                    error: error instanceof Error ? error.message : 'Unknown trust-score error',
                });
                const fallbackSource = buildFallbackSource(source, sourceIndex, reason);
                enriched[sourceIndex] = fallbackSource;
                options.onSourceEnriched?.(fallbackSource);
            }
        }
    });

    await Promise.all(workers);

    for (let index = 0; index < sources.length; index++) {
        if (!enriched[index]) {
            enriched[index] = buildFallbackSource(sources[index], index, 'timeout');
        }
    }

    const finalizedSources = enriched as ChatTransparencySource[];

    const validScores = finalizedSources
        .map((source) => source.trustScore)
        .filter((score) => typeof score === 'number' && Number.isFinite(score));

    const fallbackCount = finalizedSources.filter((source) => source.trustScore === 50 && source.reliability === 'UNKNOWN').length;
    const priorityCount = options.priorityDomains?.length ?? 0;

    const sourcesMean = validScores.length > 0
        ? Math.round(validScores.reduce((sum, score) => sum + score, 0) / validScores.length)
        : 0;

    logger.info('Chat source enrichment complete', {
        module: 'ChatSourceEnrichment',
        sourceCount: finalizedSources.length,
        sourcesMean,
        fallbackCount,
        priorityCount,
        maxConcurrent,
        timeoutMs,
        domains: finalizedSources.map((source) => source.domain),
    });

    return {
        sources: finalizedSources,
        sourcesMean,
    };
}
