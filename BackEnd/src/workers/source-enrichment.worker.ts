import { Worker, Job } from 'bullmq';
import { getRichTrustScore } from '../lib/trust-score';
import { logger } from '../lib/logger';
import { prisma } from '../lib/db';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
});

interface SourceEnrichmentJobData {
    articleId: string;
    sources: string[];
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

        // Traitement parallèle des sources (limitée par la puissance du serveur, ici tout d'un coup car ~5-10 sources max)
        const enrichmentPromises = sources.map(async (url) => {
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
                const richScore = await getRichTrustScore(domain);

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
                    metrics: richScore.details
                };

            } catch (error: any) {
                logger.error(`[Worker] Failed to enrich source ${url}`, {
                    articleId,
                    error: error.message
                });
                return null;
            }
        });

        const results = await Promise.all(enrichmentPromises);

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

        // Calcul du factScore global (moyenne sources * 0.75 + output * 0.25)
        // On récupère l'outputScore existant si disponible
        const article = await prisma.article.findUnique({
            where: { id: articleId },
            select: { factCheckData: true }
        });

        let finalFactScore = 50; // Défaut si aucune source valide
        if (validScores > 0) {
            const sourcesMean = Math.round(totalScore / validScores);

            // Récupération de l'outputScore (s'il existe dans les métadonnées)
            const existingData = article?.factCheckData as any;
            const outputScore = existingData?.metadata?.outputScore || 75; // Défaut raisonnable

            finalFactScore = Math.round((sourcesMean * 0.75) + (outputScore * 0.25));
            finalFactScore = Math.min(100, Math.max(0, finalFactScore));
        }

        // Mise à jour de l'article avec les sources enrichies + factScore
        if (enrichedSources.length > 0) {
            await prisma.article.update({
                where: { id: articleId },
                data: {
                    factCheckScore: finalFactScore,
                    factCheckData: {
                        factScore: finalFactScore,
                        sources: enrichedSources,
                        enrichedAt: new Date().toISOString(),
                        analysis: `${enrichedSources.length} sources analyzed. Average trust score: ${validScores > 0 ? Math.round(totalScore / validScores) : 'N/A'}/100`
                    }
                }
            });

            logger.info(`[Worker] Source enrichment complete for article ${articleId}`, {
                enrichedCount: enrichedSources.length,
                finalScore: finalFactScore
            });
        } else {
            logger.warn(`[Worker] No sources enriched for article ${articleId}`);
        }

        return {
            enrichedCount: enrichedSources.length,
            finalScore: finalFactScore
        };
    },
    {
        connection,
        concurrency: 10, // Traitement de 10 fichiers simultanés (High Parallelism)
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

logger.info('Source Enrichment Worker started', { module: 'Worker', concurrency: 3 });
