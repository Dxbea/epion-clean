import { Worker, Job } from 'bullmq';
import { ingestArticle } from '../lib/rag-service';
import { logger } from '../lib/logger';
import { env } from '../env';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
});

/**
 * Worker: embedding-queue
 * Processus dédié à la génération de vecteurs pour le RAG.
 */
export const embeddingWorker = new Worker(
    'embedding-queue',
    async (job: Job) => {
        const { articleId, content } = job.data;

        logger.info(`[Worker] Starting embedding job for article ${articleId}`, { jobId: job.id });

        try {
            // On appelle le service "pur". 
            // Note: ingestArticle refetch l'article depuis la DB (source de vérité).
            // L'argument 'content' n'est pas utilisé par ingestArticle actuel mais pourrait servir d'optimisation future.
            await ingestArticle(articleId);

            logger.info(`[Worker] Embedding generated successfully for article ${articleId}`);
            return true;
        } catch (error: any) {
            logger.error(`[Worker] Job failed for article ${articleId}`, { error: error.message });
            throw error; // Permet à BullMQ de gérer les retries (attempts: 3)
        }
    },
    {
        connection: connection as any,
        concurrency: 5, // Traite jusqu'à 5 articles en parallèle
    }
);

// Gestion propre de l'arrêt
embeddingWorker.on('completed', (job) => {
    logger.debug(`[Worker] Job ${job.id} completed`);
});

embeddingWorker.on('failed', (job, err) => {
    logger.error(`[Worker] Job ${job?.id} failed after attempts`, { error: err.message });
});
