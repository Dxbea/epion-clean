import { Worker, Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { getRichTrustScore } from '../lib/trust-score.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/db.js';
import { buildArticleScorePayload, hashAnalysisInput } from '../lib/score-helpers.js';
import { stableSourceId } from '../lib/structured-article.js';
import type { SourceScoreEntry } from '../lib/score-types.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const SOURCE_ENRICHMENT_WORKER_CONCURRENCY = 3;

export type WorkerRuntime = {
    worker: Worker;
    close: () => Promise<void>;
};

interface SourceEnrichmentJobData {
    articleId: string;
    sources: string[];
    scoreLiveBrut?: number;
    liveAnalysis?: any;
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

export function createSourceEnrichmentWorker(): WorkerRuntime {
    const connection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
    });

    const worker = new Worker(
        'source-enrichment-queue',
        async (job: Job<SourceEnrichmentJobData>) => {
            const { articleId, sources } = job.data;

            logger.info('[Worker] Starting source enrichment', {
                articleId,
                jobId: job.id,
                sourceCount: sources.length,
            });

            const enrichedSources: SourceScoreEntry[] = [];
            let totalScore = 0;
            let validScores = 0;
            const trustScoreByDomain = new Map<string, Promise<any>>();

            const results = await mapWithConcurrencyLimit(sources, SOURCE_ENRICHMENT_WORKER_CONCURRENCY, async (url, index) => {
                try {
                    let domain = '';
                    try {
                        domain = new URL(url).hostname.replace('www.', '');
                    } catch {
                        logger.warn('[Worker] Invalid source URL', { articleId, url });
                        return null;
                    }

                    let richScorePromise = trustScoreByDomain.get(domain);
                    if (!richScorePromise) {
                        richScorePromise = getRichTrustScore(domain);
                        trustScoreByDomain.set(domain, richScorePromise);
                    }
                    const richScore = await richScorePromise;

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
                    logger.error('[Worker] Failed to enrich source', {
                        articleId,
                        url,
                        error: error.message,
                    });
                    return null;
                }
            });

            results.forEach((res) => {
                if (res) {
                    res.id = enrichedSources.length + 1;
                    enrichedSources.push(res);
                    if (res.trustScore > 0) {
                        totalScore += res.trustScore;
                        validScores++;
                    }
                }
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

            await prisma.article.update({
                where: { id: articleId },
                data: {
                    factCheckScore,
                    factCheckData: factCheckData as any,
                    factCheckStatus: 'COMPLETED',
                    factCheckContentHash: contentHash,
                    factCheckCompletedAt: new Date(),
                    factCheckError: null,
                },
            });

            logger.info('[Worker] Source enrichment complete', {
                articleId,
                enrichedCount: enrichedSources.length,
                finalScore: factCheckScore,
                supportLevel: factCheckData.supportLevel,
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

    worker.on('completed', (job) => {
        logger.debug('[Worker] Source enrichment job completed', { jobId: job.id });
    });

    worker.on('failed', async (job, err) => {
        logger.error('[Worker] Source enrichment job failed', {
            error: err.message,
            articleId: job?.data?.articleId,
            jobId: job?.id,
        });

        if (job?.data?.articleId) {
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

    logger.info('Source Enrichment Worker started', {
        module: 'Worker',
        concurrency: SOURCE_ENRICHMENT_WORKER_CONCURRENCY,
    });

    return {
        worker,
        close: async () => {
            await worker.close();
            try {
                await connection.quit();
            } catch {
                connection.disconnect();
            }
        },
    };
}