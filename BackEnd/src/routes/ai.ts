import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { requireSession } from '../lib/session.js';
import { callWebSearchLLM, type WebChatMessage } from '../lib/web-chat.js';
import { hasSufficientFunds, chargeUser, COSTS } from '../lib/billing-service.js';
import { liveAnalysisQueue } from '../lib/queue.js';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { normalizeArticleScorePayload } from '../lib/score-helpers.js';
import { redis } from '../lib/redis.js';

export const router = Router();

const summarizeSchema = z.object({
    articleId: z.string().min(1)
});

async function canAccessArticle(
    userId: string,
    article: { authorId: string | null; status: string },
): Promise<boolean> {
    if (article.status === 'PUBLISHED') return true;
    if (article.authorId === userId) return true;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });

    return user?.role === 'ADMIN';
}

// ------------------------------------------------------------------
// POST /api/ai/summarize
// Body: { articleId: string }
// ------------------------------------------------------------------
router.post('/summarize', async (req, res) => {
    try {
        const sess = await requireSession(req, res);
        if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

        const body = summarizeSchema.safeParse(req.body);
        if (!body.success) return res.status(400).json({ error: 'INVALID_INPUT', details: body.error.format() });

        const { articleId } = body.data;

        // 1. Fetch Article
        const article = await prisma.article.findUnique({
            where: { id: articleId },
            select: { id: true, title: true, content: true, aiSummary: true, authorId: true, status: true }
        });

        if (!article) return res.status(404).json({ error: 'Article not found' });
        if (!(await canAccessArticle(sess.userId, article))) {
            return res.status(404).json({ error: 'Article not found' });
        }

        // 2. Return cached if exists
        if (article.aiSummary) {
            return res.json({ summary: article.aiSummary, cached: true });
        }

        const hasFunds = await hasSufficientFunds(sess.userId, 'CHAT_FAST');
        if (!hasFunds) {
            return res.status(402).json({
                error: "CrÃ©dits Ã©puisÃ©s pour aujourd'hui.",
                code: 'QUOTA_TOTAL',
                cost: COSTS.CHAT_FAST,
            });
        }

        // 3. Prepare Prompt
        const textToSummarize = article.content || article.title;
        if (!textToSummarize) return res.status(400).json({ error: 'Article has no content' });

        const messages: WebChatMessage[] = [
            {
                role: 'system',
                content: `You are an expert journalist. Summarize the following article in a concise, neutral, and engaging way (approx. 3-4 sentences). return ONLY the summary, no intro/outro.`
            },
            {
                role: 'user',
                content: `Title: ${article.title}\n\nContent:\n${textToSummarize.substring(0, 5000)}`
            }
        ];

        // 4. Call AI
        const aiResponse = await callWebSearchLLM(messages, { useSearch: false });
        const summary = aiResponse.choices[0]?.message?.content?.trim() || "No summary generated.";

        // 5. Save Result
        await prisma.article.update({
            where: { id: articleId },
            data: { aiSummary: summary }
        });

        await chargeUser(sess.userId, 'CHAT_FAST');

        res.json({ summary, cached: false });

    } catch (error) {
        logger.error('[AI] Summarize error', { error: (error as any)?.message });
        res.status(500).json({ error: 'AI processing failed' });
    }
});

// ------------------------------------------------------------------
// POST /api/ai/fact-check
// Body: { articleId: string }
// Async pattern: enqueue job, return jobId
// ------------------------------------------------------------------
router.post('/fact-check', async (req, res) => {
    try {
        const sess = await requireSession(req, res);
        if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

        const body = summarizeSchema.safeParse(req.body);
        if (!body.success) return res.status(400).json({ error: 'INVALID_INPUT', details: body.error.format() });

        const { articleId } = body.data;

        // 1. Check article exists
        const article = await prisma.article.findUnique({
            where: { id: articleId },
            select: { id: true, title: true, content: true, factCheckData: true, authorId: true, status: true }
        });

        if (!article) return res.status(404).json({ error: 'Article not found' });
        if (!(await canAccessArticle(sess.userId, article))) {
            return res.status(404).json({ error: 'Article not found' });
        }

        // 2. Return cached if exists
        if (article.factCheckData) {
            return res.json({ analysis: article.factCheckData, cached: true });
        }

        // 3. Check billing
        const hasFunds = await hasSufficientFunds(sess.userId, 'FACT_CHECK_PREMIUM');
        if (!hasFunds) {
            return res.status(402).json({
                error: 'Crédits insuffisants pour le fact-check.',
                code: 'INSUFFICIENT_FUNDS',
                cost: COSTS.FACT_CHECK_PREMIUM,
            });
        }

        // 4. Extract citation URLs from article content (basic URL regex)
        const urlRegex = /https?:\/\/[^\s"'<>]+/g;
        const citationUrls = (article.content?.match(urlRegex) || []).slice(0, 20);

        // 5. Enqueue live-analysis job
        const job = await liveAnalysisQueue.add('fact-check', {
            articleId: article.id,
            requestedByUserId: sess.userId,
            title: article.title,
            content: article.content || '',
            citationUrls,
        }, {
            removeOnComplete: false, // Keep result for polling
        });

        // 6. Mark article as RUNNING in DB (source of truth for lifecycle)
        await prisma.article.update({
            where: { id: articleId },
            data: {
                factCheckStatus: 'RUNNING',
                factCheckStartedAt: new Date(),
                factCheckError: null,
            },
        });

        // 7. Charge is deferred to polling (GET /fact-check/:jobId) on completion.
        // This avoids charging users for failed jobs.

        res.json({
            jobId: job.id,
            status: 'processing',
            message: 'Analyse lancée. Utilisez GET /api/ai/fact-check/:jobId pour suivre la progression.',
        });

    } catch (error) {
        logger.error('[AI] Fact-check error', { error: (error as any)?.message });
        res.status(500).json({ error: 'Fact-check failed' });
    }
});

// ------------------------------------------------------------------
// GET /api/ai/fact-check/:jobId
// Poll job status for the frontend
// The full pipeline is: live-analysis → source-enrichment → DB write.
// We check the DB (factCheckStatus) as source of truth for completion.
// ------------------------------------------------------------------
router.get('/fact-check/:jobId', async (req, res) => {
    try {
        const sess = await requireSession(req, res);
        if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

        const { jobId } = req.params;

        // First, try to find the job in the queue
        const job = await liveAnalysisQueue.getJob(jobId);

        if (!job) {
            return res.status(404).json({ error: 'Job not found', jobId });
        }

        const articleId = job.data.articleId;
        const requestedByUserId =
            typeof job.data?.requestedByUserId === 'string'
                ? job.data.requestedByUserId
                : null;

        if (requestedByUserId && requestedByUserId !== sess.userId) {
            return res.status(404).json({ error: 'Job not found', jobId });
        }

        // Check article factCheckStatus (DB is source of truth)
        const article = await prisma.article.findUnique({
            where: { id: articleId },
            select: {
                authorId: true,
                status: true,
                factCheckScore: true,
                factCheckData: true,
                factCheckStatus: true,
                factCheckError: true,
            },
        });

        if (!article) return res.status(404).json({ error: 'Article not found' });
        if (!requestedByUserId && !(await canAccessArticle(sess.userId, article))) {
            return res.status(404).json({ error: 'Job not found', jobId });
        }

        if (article?.factCheckStatus === 'COMPLETED' && article.factCheckData) {
            // Full pipeline complete — clean up the BullMQ job
            // 🔐 Charge user NOW — only on confirmed success (Check→Service→Settlement)
            const chargedUserId = requestedByUserId || sess.userId;
            if (!job.data?.chargedAt) {
                const chargeLockKey = `billing:fact-check:${jobId}`;
                const lockAcquired = await redis.set(chargeLockKey, chargedUserId, 'EX', 24 * 60 * 60, 'NX');
                try {
                    if (lockAcquired) {
                        await chargeUser(chargedUserId, 'FACT_CHECK_PREMIUM');
                        await job.updateData({
                            ...job.data,
                            chargedAt: new Date().toISOString(),
                            chargedUserId,
                        });
                    }
                } catch (chargeErr: any) {
                    if (lockAcquired) {
                        await redis.del(chargeLockKey).catch(() => undefined);
                    }
                    logger.warn('[AI] Fact-check charge failed (result still delivered)', {
                        userId: chargedUserId,
                        error: chargeErr?.message,
                    });
                }
            }

            // Normalize payload for consistent API response
            const normalized = normalizeArticleScorePayload(
                article.factCheckData,
                article.factCheckScore,
                article.factCheckStatus,
            );

            return res.json({
                status: 'completed',
                result: normalized ?? article.factCheckData,
                score: article.factCheckScore,
            });
        }

        if (article?.factCheckStatus === 'FAILED') {
            return res.json({
                status: 'failed',
                error: article.factCheckError || 'Unknown error',
            });
        }

        // Still processing (live-analysis or source-enrichment in progress)
        res.json({
            status: 'processing',
        });

    } catch (error) {
        logger.error('[AI] Fact-check poll error', { error: (error as any)?.message });
        res.status(500).json({ error: 'Poll failed' });
    }
});
