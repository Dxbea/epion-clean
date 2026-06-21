import { Worker, Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { logger } from '../lib/logger.js';
import { runLiveAnalysis, runLiveAnalysisWithGeneration } from '../lib/live-analysis/index.js';
import { getSourceEnrichmentQueue } from '../lib/queue.js';
import { prisma } from '../lib/db.js';
import { getWikipediaImage } from '../lib/images/wikipedia-fetcher.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const LIVE_ANALYSIS_WORKER_CONCURRENCY = 3;

const DEFAULT_OPINION_QUESTION = {
    question: 'Les faits presentes relevent-ils plutot d\'un probleme ponctuel ou d\'un probleme structurel ?',
    thesisA: 'Plutot ponctuel',
    thesisB: 'Plutot structurel',
};

export type WorkerRuntime = {
    worker: Worker;
    close: () => Promise<void>;
};

export interface LiveAnalysisJobData {
    articleId: string;
    title: string;
    content: string;
    citationUrls: string[];
    mode?: 'article-analysis' | 'article-generation';
    topic?: string;
    language?: string;
    style?: string;
}

function normalizeGeneratedOpinionQuestion(input: unknown) {
    if (!input || typeof input !== 'object') return DEFAULT_OPINION_QUESTION;
    const value = input as Record<string, unknown>;
    const question = typeof value.question === 'string' ? value.question.trim() : '';
    const thesisA = typeof value.thesisA === 'string' ? value.thesisA.trim() : '';
    const thesisB = typeof value.thesisB === 'string' ? value.thesisB.trim() : '';

    if (question.length < 20 || thesisA.length < 3 || thesisB.length < 3) {
        return DEFAULT_OPINION_QUESTION;
    }

    return {
        question: question.slice(0, 240),
        thesisA: thesisA.slice(0, 80),
        thesisB: thesisB.slice(0, 80),
    };
}

export function createLiveAnalysisWorker(): WorkerRuntime {
    const connection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
    });

    const worker = new Worker(
        'live-analysis-queue',
        async (job: Job<LiveAnalysisJobData>) => {
            const { articleId, title, content, mode, topic, language, style } = job.data;
            const isGenerate = mode === 'article-generation';

            logger.info('[LiveAnalysis Worker] Starting', {
                articleId,
                jobId: job.id,
                mode: isGenerate ? 'GENERATE' : 'ANALYZE',
                title: (isGenerate ? topic : title)?.slice(0, 60),
            });

            let result;

            if (isGenerate && topic) {
                result = await runLiveAnalysisWithGeneration(topic, { language, style });

                if (result.generatedContent) {
                    const gc = result.generatedContent;
                    let coverImageUrl: string | null = null;
                    if (gc.wikipedia_search_query) {
                        coverImageUrl = await getWikipediaImage(gc.wikipedia_search_query);
                    }
                    const opinionQuestion = normalizeGeneratedOpinionQuestion(gc.opinionQuestion);

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
                            slug: generateSlug(gc.title),
                            opinionQuestion: {
                                upsert: {
                                    create: opinionQuestion,
                                    update: opinionQuestion,
                                },
                            },
                        },
                    });

                    logger.info('[LiveAnalysis Worker] Article updated with generated content', {
                        articleId,
                        title: gc.title.slice(0, 60),
                        contentLength: gc.content.length,
                        score: result.globalScore,
                    });
                }
            } else {
                result = await runLiveAnalysis(title, content);

                await prisma.article.update({
                    where: { id: articleId },
                    data: {
                        factCheckScore: Math.round(result.globalScore),
                    },
                });
            }

            logger.info('[LiveAnalysis Worker] Complete', {
                articleId,
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
            concurrency: LIVE_ANALYSIS_WORKER_CONCURRENCY,
        },
    );

    worker.on('completed', async (job, result) => {
        if (!job || !result) return;

        const { citationUrls } = job.data;

        logger.info('[LiveAnalysis Worker] Chaining to source enrichment', {
            articleId: result.articleId,
            sourceCount: citationUrls?.length || 0,
            scoreLiveBrut: result.globalScore,
        });

        try {
            await getSourceEnrichmentQueue().add('enrich', {
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
            logger.error('[LiveAnalysis Worker] Failed to chain to enrichment queue', {
                articleId: result.articleId,
                error: err.message,
            });
        }
    });

    worker.on('failed', (job, err) => {
        logger.error('[LiveAnalysis Worker] Job failed', {
            error: err.message,
            articleId: job?.data?.articleId,
            jobId: job?.id,
        });
    });

    logger.info('Live Analysis Worker started', {
        module: 'Worker',
        concurrency: LIVE_ANALYSIS_WORKER_CONCURRENCY,
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

function generateSlug(title: string): string {
    const slugBase = title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${slugBase}-${Date.now().toString().slice(-6)}`;
}