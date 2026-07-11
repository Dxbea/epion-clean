import { fileURLToPath } from 'node:url';
import { Worker, Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { logger } from '../lib/logger.js';
import { runLiveAnalysis, runLiveAnalysisWithGeneration } from '../lib/live-analysis/index.js';
import { sourceEnrichmentQueue } from '../lib/queue.js';
import { stableSourceId } from '../lib/structured-article.js';
import { hashAnalysisInput } from '../lib/score-helpers.js';
import { prisma } from '../lib/db.js';
import { getWikipediaImage } from '../lib/images/wikipedia-fetcher.js';

const LIVE_ANALYSIS_WORKER_CONCURRENCY = 3;
const LIVE_ANALYSIS_LOCK_DURATION_MS = 10 * 60 * 1000;
const LIVE_ANALYSIS_STALLED_INTERVAL_MS = 2 * 60 * 1000;
const LIVE_ANALYSIS_MAX_STALLED_COUNT = 2;
const DEFAULT_OPINION_QUESTION = {
    question: 'Les faits présentés relèvent-ils plutôt d\'un problème ponctuel ou d\'un problème structurel ?',
    thesisA: 'Plutôt ponctuel',
    thesisB: 'Plutôt structurel',
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
    category?: string | null;
    generateImage?: boolean;
    imageUrl?: string | null;
    requestedByUserId?: string;
    timeoutMs?: number;
}

function createWorkerConnection(): IORedis {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    return new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
    });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_resolve, reject) => {
                timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
            }),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}
type SourcePipelineMetadata = {
    extractionStatus?: string;
    provider?: 'web' | 'rag';
    searchLane?: 'FACTUAL' | 'CRITICAL' | 'CONTEXTUAL';
    role?: 'PRIMARY_EVIDENCE' | 'CONTEXT' | 'COUNTERPOINT' | 'OFFICIAL_STATEMENT' | 'BACKGROUND' | 'UNKNOWN';
    provenance?: 'WEB_SEARCH' | 'INTERNAL_RAG' | 'USER_PROVIDED' | 'EDITORIAL' | 'IMPORTED_LEGACY' | 'UNKNOWN';
    officialStatement?: boolean;
};

function buildPendingSources(sources: Array<SourcePipelineMetadata & { url?: string; domain?: string; extractionFailureReason?: string }>) {
    return sources
        .filter((source): source is SourcePipelineMetadata & { url: string; domain?: string; extractionFailureReason?: string } => typeof source.url === 'string' && source.url.trim().length > 0)
        .map((source, index) => {
            let domain = source.domain || '';
            if (!domain) {
                try {
                    domain = new URL(source.url).hostname.replace('www.', '');
                } catch {
                    domain = 'unknown';
                }
            }

            return {
                id: index + 1,
                sourceId: stableSourceId(source.url, index),
                name: domain || 'Source inconnue',
                url: source.url,
                domain,
                trustScore: null,
                flags: null,
                type: 'PENDING',
                logo: domain && domain !== 'unknown' ? `https://logo.clearbit.com/${domain}` : null,
                description: 'Analyse en cours...',
                metrics: null,
                extractionStatus: source.extractionStatus === 'metadata_only' ? 'metadata_only' as const : undefined,
                provider: source.provider,
                searchLane: source.searchLane,
                role: source.role,
                provenance: source.provenance,
                officialStatement: source.officialStatement,
            };
        });
}

function buildInitialFactCheckData(result: any, pendingSources: ReturnType<typeof buildPendingSources>, contentHash: string) {
    const liveScore = Math.round(result.globalScore || 50);
    return {
        version: 1,
        status: 'COMPLETED',
        score: liveScore,
        factScore: liveScore,
        supportLevel: liveScore >= 70 ? 'strong' : liveScore >= 50 ? 'nuanced' : liveScore >= 30 ? 'fragile' : 'unverified',
        liveScore,
        sourcesMean: null,
        calculation: {
            formula: 'weighted-source-live-v1',
            sourceWeight: 0.75,
            contentWeight: 0.25,
            liveWeight: 0.25,
            sourcesMean: null,
            contentScore: liveScore,
            liveScore,
            finalScore: liveScore,
        },
        analyzedAt: new Date().toISOString(),
        contentHash,
        liveAnalysis: {
            contentIntent: result.contentIntent,
            pillarScores: result.pillarScores,
            judges: result.judges,
        },
        sources: pendingSources,
    };
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

/**
 * Worker: live-analysis-queue
 * Runs DISARM/live analysis and chains completed jobs to source enrichment.
 */
export function startLiveAnalysisWorker(): Worker<LiveAnalysisJobData> {
    const connection = createWorkerConnection();
    const liveAnalysisWorker = new Worker(
        'live-analysis-queue',
        async (job: Job<LiveAnalysisJobData>) => {
            const { articleId, title, content, mode, topic, language, style, requestedByUserId } = job.data;
            const timeoutMs = job.data.timeoutMs || 5 * 60 * 1000;
            const isGenerate = mode === 'article-generation';

            logger.info(`[LiveAnalysis Worker] Job started for article ${articleId}`, {
                jobId: job.id,
                userId: requestedByUserId,
                mode: isGenerate ? 'GENERATE' : 'ANALYZE',
                title: (isGenerate ? topic : title)?.slice(0, 60),
            });

            if (isGenerate) {
                const existingArticle = await prisma.article.findUnique({
                    where: { id: articleId },
                    select: {
                        title: true,
                        content: true,
                        factCheckStatus: true,
                        factCheckScore: true,
                        factCheckData: true,
                    },
                });

                if (existingArticle?.factCheckStatus === 'COMPLETED' && existingArticle.content?.trim()) {
                    const factCheckData = existingArticle.factCheckData as any;
                    const sources = Array.isArray(factCheckData?.sources) ? factCheckData.sources : [];
                    const existingCitationUrls = sources
                        .map((source: any) => source?.url)
                        .filter((url: unknown): url is string => typeof url === 'string' && url.trim().length > 0);

                    logger.info('[LiveAnalysis Worker] Generation already finalized; skipping duplicate generation', {
                        articleId,
                        jobId: job.id,
                        userId: requestedByUserId,
                        sourceCount: existingCitationUrls.length,
                    });

                    return {
                        articleId,
                        globalScore: existingArticle.factCheckScore ?? factCheckData?.score ?? factCheckData?.factScore ?? 50,
                        contentIntent: factCheckData?.liveAnalysis?.contentIntent ?? null,
                        pillarScores: factCheckData?.liveAnalysis?.pillarScores ?? null,
                        judges: factCheckData?.liveAnalysis?.judges ?? null,
                        generatedContent: null,
                        citationUrls: existingCitationUrls,
                    };
                }
            }

            await prisma.article.update({
                where: { id: articleId },
                data: {
                    factCheckStatus: 'RUNNING',
                    factCheckStartedAt: new Date(),
                    factCheckCompletedAt: null,
                    factCheckError: null,
                },
            });

            let result;
            let citationUrls = job.data.citationUrls || [];

            if (isGenerate) {
                if (!topic) {
                    throw new Error('Article generation job is missing a topic');
                }

                result = await withTimeout(
                    runLiveAnalysisWithGeneration(topic, { language, style }),
                    timeoutMs,
                    'Article generation live analysis',
                );

                if (!result.generatedContent) {
                    throw new Error('Live analysis did not return generated article content');
                }

                const pendingSources = buildPendingSources(result.sources || []);
                if (pendingSources.length === 0) {
                    throw new Error('Live analysis returned no sources for generated article');
                }

                citationUrls = pendingSources.map((source) => source.url);
                const gc = result.generatedContent;

                let coverImageUrl: string | null = job.data.imageUrl || null;
                if (!coverImageUrl && job.data.generateImage && gc.wikipedia_search_query) {
                    coverImageUrl = await getWikipediaImage(gc.wikipedia_search_query);
                }
                const opinionQuestion = normalizeGeneratedOpinionQuestion(gc.opinionQuestion);
                const contentHash = hashAnalysisInput({
                    title: gc.title,
                    summary: gc.summary,
                    content: gc.content,
                    sourceDomains: pendingSources.map((source) => source.domain),
                });
                const factCheckData = buildInitialFactCheckData(result, pendingSources, contentHash);

                await prisma.article.update({
                    where: { id: articleId },
                    data: {
                        title: gc.title,
                        summary: gc.summary,
                        content: gc.content,
                        structuredContent: gc.structuredContent as any,
                        aiSummary: gc.summary,
                        factCheckScore: Math.round(result.globalScore),
                        factCheckData: factCheckData as any,
                        factCheckStatus: 'COMPLETED',
                        factCheckContentHash: contentHash,
                        factCheckCompletedAt: new Date(),
                        factCheckError: null,
                        status: 'DRAFT',
                        generatedAt: new Date(),
                        imageUrl: coverImageUrl,
                        generationConfig: {
                            style: style || 'neutral',
                            language: language || 'fr',
                            category: job.data.category || null,
                            imagePrompt: gc.imagePrompt || null,
                            wikipedia_search_query: gc.wikipedia_search_query || null,
                            tags: gc.tags || [],
                            asyncGeneration: true,
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

                logger.info(`[LiveAnalysis Worker] Article DB update succeeded for generated article ${articleId}`, {
                    jobId: job.id,
                    userId: requestedByUserId,
                    title: gc.title.slice(0, 60),
                    contentLength: gc.content.length,
                    sourceCount: pendingSources.length,
                    score: result.globalScore,
                });
            } else {
                result = await withTimeout(
                    runLiveAnalysis(title, content),
                    timeoutMs,
                    'Article live analysis',
                );

                await prisma.article.update({
                    where: { id: articleId },
                    data: {
                        factCheckScore: Math.round(result.globalScore),
                        factCheckStatus: 'RUNNING',
                    },
                });
            }

            logger.info(`[LiveAnalysis Worker] Generation completed for article ${articleId}`, {
                jobId: job.id,
                userId: requestedByUserId,
                score: result.globalScore,
                intent: result.contentIntent,
                citationUrlCount: citationUrls.length,
            });

            return {
                articleId,
                globalScore: result.globalScore,
                contentIntent: result.contentIntent,
                pillarScores: result.pillarScores,
                judges: result.judges,
                generatedContent: result.generatedContent,
                citationUrls,
                sources: result.sources,
            };
        },
        {
            connection: connection as any,
            concurrency: LIVE_ANALYSIS_WORKER_CONCURRENCY,
            lockDuration: LIVE_ANALYSIS_LOCK_DURATION_MS,
            stalledInterval: LIVE_ANALYSIS_STALLED_INTERVAL_MS,
            maxStalledCount: LIVE_ANALYSIS_MAX_STALLED_COUNT,
        }
    );

    liveAnalysisWorker.on('completed', async (job, result) => {
        if (!job || !result) return;

        const citationUrls = Array.isArray(result.citationUrls)
            ? result.citationUrls
            : (job.data.citationUrls || []);

        if (citationUrls.length === 0) {
            logger.error('[LiveAnalysis Worker] No citation URLs available for source enrichment', {
                articleId: result.articleId,
                jobId: job.id,
                userId: job.data.requestedByUserId,
            });

            await prisma.article.update({
                where: { id: result.articleId },
                data: {
                    factCheckStatus: 'FAILED',
                    factCheckError: 'No sources were available for source enrichment',
                    factCheckCompletedAt: new Date(),
                },
            }).catch((dbErr: any) => {
                logger.error('[LiveAnalysis Worker] Failed to persist missing-source failure', {
                    articleId: result.articleId,
                    jobId: job.id,
                    error: dbErr?.message,
                });
            });
            return;
        }

        logger.info(`[LiveAnalysis Worker] Chaining to source-enrichment for article ${result.articleId}`, {
            jobId: job.id,
            userId: job.data.requestedByUserId,
            sourceCount: citationUrls.length,
            scoreLiveBrut: result.globalScore,
        });

        const sourceMetadata: Record<string, SourcePipelineMetadata> = {};
        if (Array.isArray(result.sources)) {
            for (const src of result.sources) {
                if (src?.url) {
                    sourceMetadata[src.url] = {
                        extractionStatus: src.extractionStatus,
                        provider: src.provider,
                        searchLane: src.searchLane,
                        role: src.role,
                        provenance: src.provenance,
                        officialStatement: src.officialStatement,
                    };
                }
            }
        }

        logger.info('[LiveAnalysis Worker] Source enrichment enqueue payload prepared', {
            articleId: result.articleId,
            jobId: job.id,
            sourceCount: citationUrls.length,
            metadataOnlyCount: Object.values(sourceMetadata)
                .filter((metadata) => metadata.extractionStatus === 'metadata_only')
                .length,
        });
        try {
            await sourceEnrichmentQueue.add('enrich', {
                articleId: result.articleId,
                sources: citationUrls,
                sourceMetadata,
                scoreLiveBrut: result.globalScore,
                liveAnalysis: {
                    contentIntent: result.contentIntent,
                    pillarScores: result.pillarScores,
                    judges: result.judges,
                },
                articleGeneration: job.data.mode === 'article-generation',
            }, {
                removeOnComplete: true,
                removeOnFail: 100,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                jobId: `source-enrichment-${result.articleId}`,
            });
            logger.info('[LiveAnalysis Worker] Job completed', {
                articleId: result.articleId,
                jobId: job.id,
                userId: job.data.requestedByUserId,
                sourceCount: citationUrls.length,
            });
        } catch (err: any) {
            logger.error('[LiveAnalysis Worker] Failed to chain to enrichment queue', {
                articleId: result.articleId,
                jobId: job.id,
                userId: job.data.requestedByUserId,
                error: err.message,
            });

            if (job.data.mode === 'article-generation') {
                logger.warn('[LiveAnalysis Worker] Generated article remains completed after enrichment dispatch failure', {
                    articleId: result.articleId,
                    jobId: job.id,
                    userId: job.data.requestedByUserId,
                });
                return;
            }

            await prisma.article.update({
                where: { id: result.articleId },
                data: {
                    factCheckStatus: 'FAILED',
                    factCheckError: 'Source enrichment queue dispatch failed',
                    factCheckCompletedAt: new Date(),
                },
            }).catch((dbErr: any) => {
                logger.error('[LiveAnalysis Worker] Failed to persist enrichment dispatch failure', {
                    articleId: result.articleId,
                    jobId: job.id,
                    error: dbErr?.message,
                });
            });
        }
    });

    liveAnalysisWorker.on('failed', async (job, err) => {
        logger.error(`[LiveAnalysis Worker] Job ${job?.id} failed`, {
            error: err.message,
            articleId: job?.data?.articleId,
            userId: job?.data?.requestedByUserId,
            attemptsMade: job?.attemptsMade,
            attempts: job?.opts?.attempts,
        });

        if (!job?.data?.articleId) return;
        const maxAttempts = typeof job.opts?.attempts === 'number' ? job.opts.attempts : 1;
        if ((job.attemptsMade || 0) < maxAttempts) return;

        try {
            await prisma.article.update({
                where: { id: job.data.articleId },
                data: {
                    factCheckStatus: 'FAILED',
                    factCheckError: err.message?.slice(0, 500) || 'Unknown live-analysis error',
                    factCheckCompletedAt: new Date(),
                },
            });
            logger.error('[LiveAnalysis Worker] Job failed with article marked accordingly', {
                articleId: job.data.articleId,
                jobId: job.id,
                userId: job.data.requestedByUserId,
                factCheckStatus: 'FAILED',
            });
        } catch (dbErr: any) {
            logger.error('[LiveAnalysis Worker] Failed to persist FAILED status to DB', {
                articleId: job.data.articleId,
                jobId: job.id,
                error: dbErr?.message,
            });
        }
    });
    liveAnalysisWorker.on('stalled', (jobId) => {
        logger.warn('[LiveAnalysis Worker] Job stalled', {
            jobId,
            lockDuration: LIVE_ANALYSIS_LOCK_DURATION_MS,
            stalledInterval: LIVE_ANALYSIS_STALLED_INTERVAL_MS,
            maxStalledCount: LIVE_ANALYSIS_MAX_STALLED_COUNT,
        });
    });

    logger.info('Live Analysis Worker started', {
        module: 'Worker',
        concurrency: LIVE_ANALYSIS_WORKER_CONCURRENCY,
        lockDuration: LIVE_ANALYSIS_LOCK_DURATION_MS,
        stalledInterval: LIVE_ANALYSIS_STALLED_INTERVAL_MS,
        maxStalledCount: LIVE_ANALYSIS_MAX_STALLED_COUNT,
    });
    return liveAnalysisWorker;
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    startLiveAnalysisWorker();
}
