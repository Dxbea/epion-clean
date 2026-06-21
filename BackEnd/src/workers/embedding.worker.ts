import { Worker, Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { ingestArticle } from '../lib/rag-service.js';
import { logger } from '../lib/logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const EMBEDDING_WORKER_CONCURRENCY = 5;

export type WorkerRuntime = {
    worker: Worker;
    close: () => Promise<void>;
};

export function createEmbeddingWorker(): WorkerRuntime {
    const connection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
    });

    const worker = new Worker(
        'embedding-queue',
        async (job: Job) => {
            const { articleId } = job.data;

            logger.info('[Worker] Starting embedding job', { articleId, jobId: job.id });

            try {
                await ingestArticle(articleId);
                logger.info('[Worker] Embedding generated successfully', { articleId });
                return true;
            } catch (error: any) {
                logger.error('[Worker] Embedding job failed', { articleId, error: error.message });
                throw error;
            }
        },
        {
            connection: connection as any,
            concurrency: EMBEDDING_WORKER_CONCURRENCY,
        },
    );

    worker.on('completed', (job) => {
        logger.debug('[Worker] Embedding job completed', { jobId: job.id });
    });

    worker.on('failed', (job, err) => {
        logger.error('[Worker] Embedding job failed after attempts', {
            jobId: job?.id,
            error: err.message,
        });
    });

    logger.info('Embedding Worker started', {
        module: 'Worker',
        concurrency: EMBEDDING_WORKER_CONCURRENCY,
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