import { Worker, Job } from 'bullmq';
import { getRichTrustScore } from '../lib/trust-score';
import { logger } from '../lib/logger';
import { prisma } from '../lib/db';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
});
const SOURCE_ENRICHMENT_WORKER_CONCURRENCY = 3;

interface SourceEnrichmentJobData {
    articleId: string;
    sources: string[];
    // NEW: Passed from live-analysis.worker via chainage
    scoreLiveBrut?: number;
    liveAnalysis?: any;
}

async function mapWithConcurrencyLimit<T, U>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
    if (items.length === 0) {
        return [];
    }

    const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
    const results = new Array<U>(items.length);
    let nextIndex = 0;

    await Promise.all(
        Array.from({ length: safeConcurrency }, async () => {
            while (true) {
                const currentIndex = nextIndex++;
                if (currentIndex >= items.length) {
                    return;
                }

                results[currentIndex] = await mapper(items[currentIndex], currentIndex);
            }
        }),
    );

    return results;
}

/**
 * Worker: source-enrichment-queue
 * Processus dédié à l'analyse TrustScore des sources en arrière-plan.
 * Appelé après génération d'article pour ne pas bloquer la réponse utilisateur.
 */
export const sourceEnrichmentWorker = new Worker(
    'source-enrichment-queue',
    async (job: Job<SourceEnrichmentJobData>) => {
        const { articleId, sources } = job.data;

        logger.info(`[Worker] Starting source enrichment for article ${articleId}`, {
            jobId: job.id,
            sourceCount: sources.length
        });

        const enrichedSources: any[] = [];
        let totalScore = 0;
        let validScores = 0;
        const trustScoreByDomain = new Map<string, Promise<any>>();

        // Traitement parallèle des sources (limitée par la puissance du serveur, ici tout d'un coup car ~5-10 sources max)
        const results = await mapWithConcurrencyLimit(sources, SOURCE_ENRICHMENT_WORKER_CONCURRENCY, async (url) => {
            try {
                let domain = '';
                try {
                    domain = new URL(url).hostname.replace('www.', '');
                } catch {
                    logger.warn(`[Worker] Invalid URL: ${url}`, { articleId });
                    return null;
                }

                // Appel du TrustScore Engine
                logger.debug(`[Worker] Analyzing source: ${domain}`, { articleId });
                let richScorePromise = trustScoreByDomain.get(domain);
                if (!richScorePromise) {
                    richScorePromise = getRichTrustScore(domain);
                    trustScoreByDomain.set(domain, richScorePromise);
                }
                const richScore = await richScorePromise;

                return {
                    id: 0, // Sera indexé plus tard
                    name: richScore.metadata.name,
                    url: url,
                    domain: domain,
                    trustScore: richScore.globalScore,
                    flags: richScore.flags,
                    type: richScore.metadata.type,
                    logo: `https://logo.clearbit.com/${domain}`,
                    description: richScore.metadata.description,
                    justification: richScore.metadata.justification,
                    metrics: richScore.details,
                    // NEW: Full metadata for frontend transparency display
                    metadata: {
                        reliability: richScore.metadata.reliability,
                        dbScore: richScore.globalScore, // Pass the calculated score explicitly
                        politicalBias: richScore.metadata.politicalBias,
                        biasScore: richScore.metadata.biasScore,
                        country: richScore.metadata.country,
                        explanation: richScore.metadata.explanation
                    }
                };

            } catch (error: any) {
                logger.error(`[Worker] Failed to enrich source ${url}`, {
                    articleId,
                    error: error.message
                });
                return null;
            }
        });

        // Filtrage et Indexation
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

        // Calcul du factScore global (moyenne sources * 0.75 + ScoreLiveBrut * 0.25)
        let finalFactScore = 50; // Défaut si aucune source valide
        const scoreLiveBrut = job.data.scoreLiveBrut ?? 75;
        const sourcesMean = validScores > 0 ? Math.round(totalScore / validScores) : null;

        if (validScores > 0) {
            finalFactScore = Math.round((sourcesMean! * 0.75) + (scoreLiveBrut * 0.25));
            finalFactScore = Math.min(100, Math.max(0, finalFactScore));
        } else {
            // No valid sources: use ScoreLiveBrut as sole signal
            finalFactScore = scoreLiveBrut;
        }

        // Mise à jour de l'article avec les sources enrichies + factScore
        if (enrichedSources.length > 0) {
            await prisma.article.update({
                where: { id: articleId },
                data: {
                    factCheckScore: finalFactScore,
                    factCheckData: {
                        factScore: finalFactScore,
                        liveScore: scoreLiveBrut,
                        enrichedAt: new Date().toISOString(),
                        calculation: {
                            formula: 'weighted-source-live-v1',
                            sourceWeight: 0.75,
                            liveWeight: 0.25,
                            sourcesMean,
                            liveScore: scoreLiveBrut,
                            finalScore: finalFactScore,
                        },
                        // Article-level analysis (from live-analysis pipeline)
                        liveAnalysis: job.data.liveAnalysis || null,
                        // Source-level data (from enrichment)
                        sources: enrichedSources,
                        sourcesMean,
                    }
                }
            });

            logger.info(`[Worker] Source enrichment complete for article ${articleId}`, {
                enrichedCount: enrichedSources.length,
                finalScore: finalFactScore
            });
        } else {
            // No sources enriched, but still save liveAnalysis data
            await prisma.article.update({
                where: { id: articleId },
                data: {
                    factCheckScore: finalFactScore,
                    factCheckData: {
                        factScore: finalFactScore,
                        liveScore: scoreLiveBrut,
                        enrichedAt: new Date().toISOString(),
                        calculation: {
                            formula: 'weighted-source-live-v1',
                            sourceWeight: 0.75,
                            liveWeight: 0.25,
                            sourcesMean: null,
                            liveScore: scoreLiveBrut,
                            finalScore: finalFactScore,
                        },
                        liveAnalysis: job.data.liveAnalysis || null,
                        sources: [],
                        sourcesMean: null,
                    }
                }
            });
            logger.warn(`[Worker] No sources enriched for article ${articleId}, saved liveAnalysis only`);
        }

        return {
            enrichedCount: enrichedSources.length,
            finalScore: finalFactScore
        };
    },
    {
        connection: connection as any,
        concurrency: SOURCE_ENRICHMENT_WORKER_CONCURRENCY,
    }
);

sourceEnrichmentWorker.on('completed', (job) => {
    logger.debug(`[Worker] Source enrichment job ${job.id} completed`);
});

sourceEnrichmentWorker.on('failed', (job, err) => {
    logger.error(`[Worker] Source enrichment job ${job?.id} failed`, {
        error: err.message,
        articleId: job?.data?.articleId
    });
});

logger.info('Source Enrichment Worker started', { module: 'Worker', concurrency: SOURCE_ENRICHMENT_WORKER_CONCURRENCY });
