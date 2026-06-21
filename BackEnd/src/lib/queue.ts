import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { logger } from './logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let connection: IORedis | null = null;
let closePromise: Promise<void> | null = null;
const openedQueues = new Map<string, Queue>();

function getConnection(): IORedis {
    if (!connection) {
        connection = new IORedis(redisUrl, {
            maxRetriesPerRequest: null,
        });
    }

    return connection;
}

function getQueue(name: string, create: () => Queue): Queue {
    const existing = openedQueues.get(name);
    if (existing) return existing;

    const queue = create();
    openedQueues.set(name, queue);
    return queue;
}

export function getBullConnection(): IORedis {
    return getConnection();
}

export function getEmbeddingQueue(): Queue {
    return getQueue('embedding-queue', () => {
        const queue = new Queue('embedding-queue', {
            connection: getConnection() as any,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                },
                removeOnComplete: true,
                removeOnFail: 100,
            },
        });

        queue.on('error', (err) => {
            logger.error('Queue connection error', { module: 'Queue', error: err.message });
        });

        logger.info('Embedding Queue initialized', { module: 'Queue' });
        return queue;
    });
}

export function getSourceEnrichmentQueue(): Queue {
    return getQueue('source-enrichment-queue', () => {
        const queue = new Queue('source-enrichment-queue', {
            connection: getConnection() as any,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
                removeOnComplete: true,
                removeOnFail: 100,
            },
        });

        queue.on('error', (err) => {
            logger.error('Source Enrichment Queue error', { module: 'Queue', error: err.message });
        });

        logger.info('Source Enrichment Queue initialized', { module: 'Queue' });
        return queue;
    });
}

export function getLiveAnalysisQueue(): Queue {
    return getQueue('live-analysis-queue', () => {
        const queue = new Queue('live-analysis-queue', {
            connection: getConnection() as any,
            defaultJobOptions: {
                attempts: 2,
                backoff: {
                    type: 'exponential',
                    delay: 3000,
                },
                removeOnComplete: 50,
                removeOnFail: 100,
            },
        });

        queue.on('error', (err) => {
            logger.error('Live Analysis Queue error', { module: 'Queue', error: err.message });
        });

        logger.info('Live Analysis Queue initialized', { module: 'Queue' });
        return queue;
    });
}

export function getNewsIngestionQueue(): Queue {
    return getQueue('news-ingestion-queue', () => {
        const queue = new Queue('news-ingestion-queue', {
            connection: getConnection() as any,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 60_000,
                },
                removeOnComplete: 25,
                removeOnFail: 50,
            },
        });

        queue.on('error', (err) => {
            logger.error('News Ingestion Queue error', { module: 'Queue', error: err.message });
        });

        logger.info('News Ingestion Queue initialized', { module: 'Queue' });
        return queue;
    });
}

export async function closeOpenedQueues(): Promise<void> {
    if (closePromise) return closePromise;

    closePromise = (async () => {
        const queues = Array.from(openedQueues.values());
        openedQueues.clear();

        for (const queue of queues) {
            await queue.close();
        }

        if (connection) {
            const redisConnection = connection;
            connection = null;
            try {
                await redisConnection.quit();
            } catch {
                redisConnection.disconnect();
            }
        }
    })();

    return closePromise;
}