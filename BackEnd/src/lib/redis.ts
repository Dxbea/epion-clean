import { Redis } from 'ioredis';
import { env } from '../env.js';
import { logger } from './logger.js';

const redisUrl = env.REDIS_URL;

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
});

redis.on('error', (err) => {
    // Silent error log to avoid spamming if redis is optional or down
    // We rely on try/catch in usage to fall back to DB
    logger.warn('Redis connection error', { module: 'Redis', error: err.message });
});

redis.on('connect', () => {
    logger.info('Redis connected', { module: 'Redis' });
});
