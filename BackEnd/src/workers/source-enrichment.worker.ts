import { fileURLToPath } from 'node:url';
import { Worker, Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { getRichTrustScore } from '../lib/trust-score.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/db.js';
import { buildArticleScorePayload, hashAnalysisInput } from '../lib/score-helpers.js';
import { stableSourceId } from '../lib/structured-article.js';
import type { SourceScoreEntry, SourceAnalysisStatus } from '../lib/score-types.js';

const SOURCE_ENRICHMENT_WORKER_CONCURRENCY = 3;

interface SourceEnrichmentJobData {
    articleId: string;
    sources: string[];
    sourceMetadata?: Record<string, { extractionStatus?: string }>;
    scoreLiveBrut?: number;
    liveAnalysis?: any;
    articleGeneration?: boolean;
}

function createWorkerConnection(): IORedis {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    return new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
    });
}

async function mapWithConcurrencyLimit<T, U>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
    if (items.length === 0) return [];

    const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
    const results = new Array<U>(items.length);
    let nextIndex = 0;

    await Promise.all(
        Array.from({ length: safeConcurrency }, async () => {
            while (true) {
                const currentIndex = nextIndex++;
                if (currentIndex >= items.length) return;
                results[currentIndex] = await mapper(items[currentIndex], currentIndex);
            }
        }),
    );

    return results;
}

/**
 * Worker: source-enrichment-queue
 * Enriches article sources with TrustScore data and computes the final FactScore.
 */
export function startSourceEnrichmentWorker(): Worker<SourceEnrichmentJobData> {
    const connection = createWorkerConnection();
    const sourceEnrichmentWorker = new Worker(
        'source-enrichment-queue',
        async (job: Job<SourceEnrichmentJobData>) => {
            const { articleId, sources } = job.data;

            logger.info(`[Worker] Starting source enrichment for article ${articleId}`, {
                jobId: job.id,
                sourceCount: sources.length,
            });

            const enrichedSources: SourceScoreEntry[] = [];
            let totalScore = 0;
            let validScores = 0;
            const trustScoreByDomain = new Map<string, Promise<any>>();
            const sourceMetadata = job.data.sourceMetadata ?? {};

            const results = await mapWithConcurrencyLimit(sources, SOURCE_ENRICHMENT_WORKER_CONCURRENCY, async (url, index) => {
                let domain = '';
                try {
                    domain = new URL(url).hostname.replace('www.', '');
                } catch {
                    logger.warn(`[Worker] Invalid URL: ${url}`, { articleId });
                    return null;
                }

                const meta = sourceMetadata[url];
                const isMetadataOnly = meta?.extractionStatus === 'metadata_only';

                try {
                    logger.debug(`[Worker] Analyzing source: ${domain}`, { articleId });
                    let richScorePromise = trustScoreByDomain.get(domain);
                    if (!richScorePromise) {
                        richScorePromise = getRichTrustScore(domain);
                        trustScoreByDomain.set(domain, richScorePromise);
                    }
                    const richScore = await richScorePromise;

                    const analysisStatus: SourceAnalysisStatus = isMetadataOnly ? 'METADATA_ONLY' : 'ANALYZED';

                    return {
                        id: 0,
                        sourceId: stableSourceId(url, index),
                        name: richScore.metadata.name,
                        url,
                        domain,
                        trustScore: richScore.globalScore,
                        type: richScore.metadata.type,
                        logo: `https://logo.clearbit.com/${domain}`,
                        description: richScore.metadata.description,
                        justification: richScore.metadata.justification,
                        metrics: richScore.details
                            ? {
                                transparency: richScore.details.transparency,
                                editorial: richScore.details.editorial,
                                semantic: richScore.details.semantic,
                                logic: richScore.details.pluralism,
                            }
                            : null,
                        flags: richScore.flags ?? null,
                        analysisStatus,
                        extractionStatus: isMetadataOnly ? 'metadata_only' as const : 'full' as const,
                        profileData: richScore.profileData,
                        profileVersion: richScore.profileVersion,
                        profileConfidence: richScore.profileConfidence,
                        lastProfiledAt: richScore.lastProfiledAt,
                        publicTrustLabel: richScore.publicTrustLabel,
                        metadata: {
                            reliability: richScore.metadata.reliability,
                            dbScore: richScore.globalScore,
                            politicalBias: richScore.metadata.politicalBias,
                            biasScore: richScore.metadata.biasScore,
                            country: richScore.metadata.country,
                            explanation: richScore.metadata.explanation,
                        },
                    } satisfies SourceScoreEntry;
                } catch (error: any) {
                    logger.error(`[Worker] Failed to enrich source ${url}`, {
                        articleId,
                        error: error.message,
                    });
                    return {
                        id: 0,
                        sourceId: stableSourceId(url, index),
                        name: domain || 'Source inconnue',
                        url,
                        domain,
                        trustScore: 0,
                        type: 'UNAVAILABLE',
                        logo: domain ? `https://logo.clearbit.com/${domain}` : '',
                        description: null,
                        justification: null,
                        metrics: null,
                        flags: null,
                        analysisStatus: 'UNAVAILABLE' as SourceAnalysisStatus,
                        extractionStatus: 'failed' as const,
                        metadata: {},
                    } satisfies SourceScoreEntry;
                }
            });

            results.forEach((res) => {
                if (res) {
                    res.id = enrichedSources.length + 1;
                    enrichedSources.push(res);
                    if (res.analysisStatus === 'ANALYZED' && res.trustScore > 0) {
                        totalScore += res.trustScore;
                        validScores++;
                    }
                }
            });

            const sourceOutcomeCounts = {
                analyzed: enrichedSources.filter((source) => source.analysisStatus === 'ANALYZED').length,
                metadataOnly: enrichedSources.filter((source) => source.analysisStatus === 'METADATA_ONLY').length,
                unavailable: enrichedSources.filter((source) => source.analysisStatus === 'UNAVAILABLE').length,
            };
            logger.info('[Worker] Source enrichment source outcomes', {
                articleId,
                jobId: job.id,
                sourceCount: sources.length,
                processedCount: enrichedSources.length,
                skippedCount: results.filter((result) => !result).length,
                ...sourceOutcomeCounts,
                failed: sourceOutcomeCounts.unavailable,
            });
            const scoreLiveBrut = job.data.scoreLiveBrut ?? 75;
            const sourcesMean = validScores > 0 ? Math.round(totalScore / validScores) : null;

            const article = await prisma.article.findUnique({
                where: { id: articleId },
                select: { title: true, summary: true, content: true },
            });

            const contentHash = article
                ? hashAnalysisInput({
                    title: article.title,
                    summary: article.summary,
                    content: article.content,
                    sourceDomains: enrichedSources.map((s) => s.domain),
                })
                : '';

            const { factCheckScore, factCheckData } = buildArticleScorePayload({
                sourcesMean,
                contentScore: scoreLiveBrut,
                contentHash,
                sources: enrichedSources,
                liveAnalysis: job.data.liveAnalysis || null,
            });

            const hasEnrichedSources = enrichedSources.length > 0;
            if (!hasEnrichedSources && job.data.articleGeneration) {
                logger.warn('[Worker] No sources enriched for generated article; preserving completed generation state', {
                    articleId,
                    jobId: job.id,
                });
                return {
                    enrichedCount: 0,
                    finalScore: factCheckScore,
                    preservedGeneratedArticle: true,
                };
            }

            if (!hasEnrichedSources) {
                factCheckData.status = 'FAILED';
            }

            try {
                await prisma.article.update({
                    where: { id: articleId },
                    data: {
                        factCheckScore,
                        factCheckData: factCheckData as any,
                        factCheckStatus: hasEnrichedSources ? 'COMPLETED' : 'FAILED',
                        factCheckContentHash: contentHash,
                        factCheckCompletedAt: new Date(),
                        factCheckError: hasEnrichedSources ? null : 'No sources were available for enrichment',
                    },
                });
            } catch (error: any) {
                logger.error('[Worker] Failed to persist Article.factCheckData.sources', {
                    articleId,
                    jobId: job.id,
                    sourceCount: sources.length,
                    ...sourceOutcomeCounts,
                    error: error?.message,
                });
                throw error;
            }

            logger.info(`[Worker] Source enrichment complete for article ${articleId}`, {
                enrichedCount: enrichedSources.length,
                finalScore: factCheckScore,
                supportLevel: factCheckData.supportLevel,
                factCheckStatus: hasEnrichedSources ? 'COMPLETED' : 'FAILED',
            });

            return {
                enrichedCount: enrichedSources.length,
                finalScore: factCheckScore,
            };
        },
        {
            connection: connection as any,
            concurrency: SOURCE_ENRICHMENT_WORKER_CONCURRENCY,
        },
    );

    sourceEnrichmentWorker.on('completed', (job) => {
        logger.debug(`[Worker] Source enrichment job ${job.id} completed`);
    });

    sourceEnrichmentWorker.on('failed', async (job, err) => {
        logger.error(`[Worker] Source enrichment job ${job?.id} failed`, {
            error: err.message,
            articleId: job?.data?.articleId,
        });

        if (job?.data?.articleId) {
            if (job.data.articleGeneration) {
                logger.warn('[Worker] Source enrichment failed for generated article; preserving completed generation state', {
                    articleId: job.data.articleId,
                    jobId: job.id,
                    error: err.message,
                });
                return;
            }

            try {
                await prisma.article.update({
                    where: { id: job.data.articleId },
                    data: {
                        factCheckStatus: 'FAILED',
                        factCheckError: err.message?.slice(0, 500) || 'Unknown error',
                    },
                });
            } catch (dbErr: any) {
                logger.error('[Worker] Failed to persist FAILED status to DB', {
                    articleId: job.data.articleId,
                    error: dbErr?.message,
                });
            }
        }
    });

    logger.info('Source Enrichment Worker started', { module: 'Worker', concurrency: SOURCE_ENRICHMENT_WORKER_CONCURRENCY });
    return sourceEnrichmentWorker;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    startSourceEnrichmentWorker();
}
