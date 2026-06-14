/**
 * Live Analysis Worker (Epion 3.0)
 * 
 * Queue: live-analysis-queue
 * 
 * Two modes:
 * - 'article-analysis': Analyzes an existing article (DISARM only)
 * - 'article-generation': Generates article content from a topic + DISARM analysis
 * 
 * On completion:
 * - In GENERATE mode: writes the generated title/summary/content to DB
 * - Then chains to source-enrichment-queue
 */
import { Worker, Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { logger } from '../lib/logger.js';
import { runLiveAnalysis, runLiveAnalysisWithGeneration } from '../lib/live-analysis/index.js';
import { sourceEnrichmentQueue } from '../lib/queue.js';
import { prisma } from '../lib/db.js';
import { getWikipediaImage } from '../lib/images/wikipedia-fetcher.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
});

export interface LiveAnalysisJobData {
    articleId: string;
    title: string;
    content: string;
    citationUrls: string[];
    // Generation mode fields
    mode?: 'article-analysis' | 'article-generation';
    topic?: string;
    language?: string;
    style?: string;
}

export const liveAnalysisWorker = new Worker(
    'live-analysis-queue',
    async (job: Job<LiveAnalysisJobData>) => {
        const { articleId, title, content, mode, topic, language, style } = job.data;
        const isGenerate = mode === 'article-generation';

        logger.info(`[LiveAnalysis Worker] Starting for article ${articleId}`, {
            jobId: job.id,
            mode: isGenerate ? 'GENERATE' : 'ANALYZE',
            title: (isGenerate ? topic : title)?.slice(0, 60),
        });

        let result;

        if (isGenerate && topic) {
            // === GENERATE MODE ===
            // The pipeline generates the article content AND scores it
            result = await runLiveAnalysisWithGeneration(topic, { language, style });

            // Write the generated article text + scores to DB
            if (result.generatedContent) {
                const gc = result.generatedContent;

                // Attempt to fetch a Wikipedia image if a query was generated
                let coverImageUrl: string | null = null;
                if (gc.wikipedia_search_query) {
                    coverImageUrl = await getWikipediaImage(gc.wikipedia_search_query);
                }

                // Build the source objects for factCheckData
                // Sources come from the Tavily investigation (not Perplexity citations anymore)
                const sourceObjects = (result.judges.primary as any).generatedContent
                    ? [] // Sources will be populated from citationUrls by source-enrichment
                    : [];

                await prisma.article.update({
                    where: { id: articleId },
                    data: {
                        title: gc.title,
                        summary: gc.summary,
                        content: gc.content,
                        structuredContent: gc.structuredContent as any,
                        aiSummary: gc.summary,
                        factCheckScore: Math.round(result.globalScore),
                        imageUrl: coverImageUrl,
                        generationConfig: {
                            style: style || 'neutral',
                            language: language || 'fr',
                            imagePrompt: gc.imagePrompt || null,
                            tags: gc.tags || [],
                        },
                        // Update the slug based on the generated title
                        slug: generateSlug(gc.title),
                    },
                });

                logger.info(`✏️ [LiveAnalysis Worker] Article ${articleId} updated with generated content`, {
                    title: gc.title.slice(0, 60),
                    contentLength: gc.content.length,
                    score: result.globalScore,
                });
            }
        } else {
            // === ANALYZE MODE ===
            result = await runLiveAnalysis(title, content);

            // Update the score in DB
            await prisma.article.update({
                where: { id: articleId },
                data: {
                    factCheckScore: Math.round(result.globalScore),
                },
            });
        }

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
            generatedContent: result.generatedContent,
        };
    },
    {
        connection: connection as any,
        concurrency: 3,
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

// ─── Helper ──────────────────────────────────────────────────────────────────

function generateSlug(title: string): string {
    const slugBase = title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${slugBase}-${Date.now().toString().slice(-6)}`;
}
