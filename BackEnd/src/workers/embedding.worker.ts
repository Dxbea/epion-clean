import { fileURLToPath } from 'node:url';
import { Worker, Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { ingestArticle } from '../lib/rag-service.js';
import { logger } from '../lib/logger.js';

function createWorkerConnection(): IORedis {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    return new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
    });
}

/**
 * Worker: embedding-queue
 * Dedicated process for RAG vector generation.
 */
export function startEmbeddingWorker(): Worker {
    const connection = createWorkerConnection();
    const embeddingWorker = new Worker(
        'embedding-queue',
        async (job: Job) => {
            const { articleId } = job.data;

            logger.info(`[Worker] Starting embedding job for article ${articleId}`, { jobId: job.id });

            try {
                await ingestArticle(articleId);

                logger.info(`[Worker] Embedding generated successfully for article ${articleId}`);
                return true;
            } catch (error: any) {
                logger.error(`[Worker] Job failed for article ${articleId}`, { error: error.message });
                throw error;
            }
        },
        {
            connection: connection as any,
            concurrency: 5,
        }
    );

    embeddingWorker.on('completed', (job) => {
        logger.debug(`[Worker] Job ${job.id} completed`);
    });

    embeddingWorker.on('failed', (job, err) => {
        logger.error(`[Worker] Job ${job?.id} failed after attempts`, { error: err.message });
    });

    logger.info('Embedding Worker started', { module: 'Worker', concurrency: 5 });
    return embeddingWorker;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    startEmbeddingWorker();
}
