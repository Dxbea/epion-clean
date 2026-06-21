import { Queue } from 'bullmq';
import { env } from '../env.js';
import { logger } from './logger.js';

const redisUrl = env.REDIS_URL;

// Parse redis URL to fit BullMQ connection options if needed, 
// strictly speaking BullMQ accepts a connection object or URL, but ioredis instance is preferred for reuse
// Here we will use the connection object approach for simplicity and robustness
import { Redis as IORedis } from 'ioredis';

const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null, // Required by BullMQ
});

export const embeddingQueue = new Queue('embedding-queue', {
    connection: connection as any,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: true, // Keep redis clean
        removeOnFail: 100,      // Keep last 100 failed jobs for debugging
    },
});

embeddingQueue.on('error', (err) => {
    logger.error('Queue connection error', { module: 'Queue', error: err.message });
});

logger.info('Embedding Queue initialized', { module: 'Queue' });

// Source Enrichment Queue (TrustScore Analysis)
export const sourceEnrichmentQueue = new Queue('source-enrichment-queue', {
    connection: connection as any,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000, // 2s, 4s, 8s
        },
        removeOnComplete: true,
        removeOnFail: 100,
    },
});

sourceEnrichmentQueue.on('error', (err) => {
    logger.error('Source Enrichment Queue error', { module: 'Queue', error: err.message });
});

logger.info('Source Enrichment Queue initialized', { module: 'Queue' });

// Live Analysis Queue (Epion 2.0 — Article Fact-Check Pipeline)
export const liveAnalysisQueue = new Queue('live-analysis-queue', {
    connection: connection as any,
    defaultJobOptions: {
        attempts: 2,
        backoff: {
            type: 'exponential',
            delay: 3000, // 3s, 6s (longer due to 3 API calls)
        },
        removeOnComplete: 50,  // Keep last 50 for result polling
        removeOnFail: 100,
    },
});

liveAnalysisQueue.on('error', (err) => {
    logger.error('Live Analysis Queue error', { module: 'Queue', error: err.message });
});

logger.info('Live Analysis Queue initialized', { module: 'Queue' });

export const newsIngestionQueue = new Queue('news-ingestion-queue', {
    connection: connection as any,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 60_000, // 60s → 120s → 240s — GDELT needs long pauses on 429
        },
        removeOnComplete: 25,
        removeOnFail: 50,
    },
});

newsIngestionQueue.on('error', (err) => {
    logger.error('News Ingestion Queue error', { module: 'Queue', error: err.message });
});

logger.info('News Ingestion Queue initialized', { module: 'Queue' });
