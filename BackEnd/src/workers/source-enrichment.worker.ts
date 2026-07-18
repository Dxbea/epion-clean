import { fileURLToPath } from 'node:url';
import { Worker, Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { getRichTrustScore } from '../lib/trust-score.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/db.js';
import { stableSourceId } from '../lib/structured-article.js';
import type { SourceScoreEntry, SourceAnalysisStatus } from '../lib/score-types.js';
import {
    buildArticleFinalizationContract,
    isCanonicalStructuredArticleContent,
    persistArticleFinalization,
} from '../lib/article-finalization.js';
import {
    buildEnrichedSourceScoreEntry,
    type SourceEnrichmentMetadata,
} from '../lib/source-enrichment-source.js';

const SOURCE_ENRICHMENT_WORKER_CONCURRENCY = 3;

interface SourceEnrichmentJobData {
    articleId: string;
    sources: string[];
    sourceMetadata?: Record<string, SourceEnrichmentMetadata>;
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

                    return buildEnrichedSourceScoreEntry({
                        url,
                        index,
                        domain,
                        richScore,
                        analysisStatus,
                        metadata: meta,
                    });
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
                        provider: meta?.provider,
                        searchLane: meta?.searchLane,
                        role: meta?.role,
                        provenance: meta?.provenance,
                        officialStatement: meta?.officialStatement,
                        metadata: {},
                    } satisfies SourceScoreEntry;
                }
            });

            results.forEach((res) => {
                if (res) {
                    res.id = enrichedSources.length + 1;
                    enrichedSources.push(res);
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

            const article = await prisma.article.findUnique({
                where: { id: articleId },
                select: { title: true, summary: true, content: true, structuredContent: true },
            });
            if (!article) throw new Error(`Article not found during finalization: ${articleId}`);

            const finalization = buildArticleFinalizationContract({
                articleId,
                title: article.title,
                summary: article.summary,
                content: article.content,
                structuredContent: isCanonicalStructuredArticleContent(article.structuredContent)
                    ? article.structuredContent
                    : null,
                contentScore: scoreLiveBrut,
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
                    finalScore: finalization.factCheckScore,
                    preservedGeneratedArticle: true,
                };
            }

            try {
                await persistArticleFinalization(prisma, finalization);
            } catch (error: any) {
                logger.error('[Worker] Failed to persist article source enrichment transaction', {
                    articleId,
                    jobId: job.id,
                    sourceCount: sources.length,
                    articleSourceUpsertCount: finalization.articleSourceUpserts.length,
                    ...sourceOutcomeCounts,
                    error: error?.message,
                });
                throw error;
            }

            logger.info(`[Worker] Source enrichment complete for article ${articleId}`, {
                enrichedCount: enrichedSources.length,
                finalScore: finalization.factCheckScore,
                supportLevel: finalization.factCheckData.supportLevel,
                factCheckStatus: finalization.factCheckStatus,
            });

            return {
                enrichedCount: enrichedSources.length,
                finalScore: finalization.factCheckScore,
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
