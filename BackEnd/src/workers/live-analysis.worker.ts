/**
 * Live Analysis Worker (Epion 2.0)
 * 
 * Queue: live-analysis-queue
 * 
 * Runs the full Relay Race pipeline: Perplexity → GPT → Mistral
 * On completion, chains to source-enrichment-queue.
 */
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../lib/logger';
import { runLiveAnalysis } from '../lib/live-analysis';
import { sourceEnrichmentQueue } from '../lib/queue';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
});

export interface LiveAnalysisJobData {
    articleId: string;
    title: string;
    content: string;
    citationUrls: string[];
}

export const liveAnalysisWorker = new Worker(
    'live-analysis-queue',
    async (job: Job<LiveAnalysisJobData>) => {
        const { articleId, title, content } = job.data;

        logger.info(`[LiveAnalysis Worker] Starting for article ${articleId}`, {
            jobId: job.id,
            title: title.slice(0, 60),
        });

        // Run the full Relay Race pipeline (2A → 2B → 2C)
        const result = await runLiveAnalysis(title, content);

        logger.info(`[LiveAnalysis Worker] Complete for article ${articleId}`, {
            jobId: job.id,
            score: result.globalScore,
            intent: result.contentIntent,
        });

        return {
            articleId,
            globalScore: result.globalScore,
            contentIntent: result.contentIntent,
            pillarScores: result.pillarScores,
            judges: result.judges,
        };
    },
    {
        connection,
        concurrency: 3, // Max 3 concurrent analyses (each involves 3 API calls)
    }
);

// CHAINAGE: On completion, enqueue source enrichment
liveAnalysisWorker.on('completed', async (job, result) => {
    if (!job || !result) return;

    const { citationUrls } = job.data;

    logger.info(`[LiveAnalysis Worker] Chaining to source-enrichment for article ${result.articleId}`, {
        sourceCount: citationUrls?.length || 0,
        scoreLiveBrut: result.globalScore,
    });

    try {
        await sourceEnrichmentQueue.add('enrich', {
            articleId: result.articleId,
            sources: citationUrls || [],
            // Pass the live analysis result to the enrichment worker
            scoreLiveBrut: result.globalScore,
            liveAnalysis: {
                contentIntent: result.contentIntent,
                pillarScores: result.pillarScores,
                judges: result.judges,
            },
        }, {
            removeOnComplete: true,
            attempts: 2,
        });
    } catch (err: any) {
        logger.error(`[LiveAnalysis Worker] Failed to chain to enrichment queue`, {
            articleId: result.articleId,
            error: err.message,
        });
    }
});

liveAnalysisWorker.on('failed', (job, err) => {
    logger.error(`[LiveAnalysis Worker] Job ${job?.id} failed`, {
        error: err.message,
        articleId: job?.data?.articleId,
    });
});

logger.info('Live Analysis Worker started', { module: 'Worker', concurrency: 3 });
