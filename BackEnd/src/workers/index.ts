import { fileURLToPath } from 'node:url';
import type { Worker } from 'bullmq';
import { logger } from '../lib/logger.js';
import { NEWS_SITEMAPS } from '../lib/news-sitemaps.js';
import { newsIngestionQueue } from '../lib/queue.js';
import { recalculateBridgingScores } from '../services/bridgingService.js';
import { initializeCron } from '../cron/dailyReset.js';
import { startEmbeddingWorker } from './embedding.worker.js';
import { startSourceEnrichmentWorker } from './source-enrichment.worker.js';
import { startLiveAnalysisWorker } from './live-analysis.worker.js';
import { startNewsWorker } from './news-worker.js';

const workerLog = logger.child({ module: 'WorkerEntrypoint' });
const schedulerLog = logger.child({ module: 'Scheduler' });

async function scheduleRecurringJobs(): Promise<void> {
    try {
        const existingRepeatables = await newsIngestionQueue.getRepeatableJobs();
        for (const job of existingRepeatables) {
            await newsIngestionQueue.removeRepeatableByKey(job.key);
            schedulerLog.info('Removed stale repeatable job', {
                name: job.name,
                pattern: job.pattern,
                key: job.key,
            });
        }
    } catch (err: any) {
        schedulerLog.warn('Failed to clean stale repeatable jobs', {
            error: err.message,
        });
    }

    schedulerLog.info('Scheduling News Ingestion Job (GDELT every 2 hours)');
    await newsIngestionQueue.add('discover-gdelt', {
        query: 'lang:French',
        maxRecords: 15,
    }, {
        repeat: {
            pattern: '0 */2 * * *',
        },
    });

    schedulerLog.info(`Scheduling News Ingestion Job (${NEWS_SITEMAPS.permissive.label} sitemap daily at 3:30 AM)`);
    await newsIngestionQueue.add('discover-sitemap', {
        sitemapUrl: NEWS_SITEMAPS.permissive.url,
        maxUrls: 100,
    }, {
        repeat: {
            pattern: '30 3 * * *',
        },
    });
}

function startBridgingRecalculationInterval(): NodeJS.Timeout {
    const interval = setInterval(() => {
        recalculateBridgingScores()
            .then((processed) => {
                if (processed > 0) {
                    schedulerLog.info('Periodic bridging score recalculation complete', { processed });
                }
            })
            .catch((err: any) => {
                schedulerLog.warn('Periodic bridging score recalculation failed', {
                    error: err.message,
                });
            });
    }, 5 * 60 * 1000);

    interval.unref();
    return interval;
}

export async function startWorkers(): Promise<Worker[]> {
    const workers = [
        startEmbeddingWorker(),
        startSourceEnrichmentWorker(),
        startLiveAnalysisWorker(),
        startNewsWorker(),
    ];

    initializeCron();
    await scheduleRecurringJobs();
    startBridgingRecalculationInterval();

    workerLog.info('Worker process started', {
        workers: ['embedding', 'source-enrichment', 'live-analysis', 'news'],
    });

    return workers;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    startWorkers().catch((error: any) => {
        workerLog.error('Worker startup crashed unexpectedly', {
            error: error.message,
            stack: error.stack,
        });
        process.exit(1);
    });
}

