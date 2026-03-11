import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireSession } from '../lib/session';
import { checkAndIncrement } from '../lib/rateLimiter';
import { callPerplexity } from '../lib/perplexity';
import { AI_MODELS } from '../config/ai-models';
import { hasSufficientFunds, chargeUser, COSTS } from '../lib/billing-service';
import { liveAnalysisQueue } from '../lib/queue';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

export const router = Router();

const summarizeSchema = z.object({
    articleId: z.string().min(1)
});

// ------------------------------------------------------------------
// POST /api/ai/summarize
// Body: { articleId: string }
// ------------------------------------------------------------------
router.post('/summarize', async (req, res) => {
    try {
        const sess = await requireSession(req, res);
        if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

        // Rate Limit (DB)
        await checkAndIncrement(sess.userId);

        const body = summarizeSchema.safeParse(req.body);
        if (!body.success) return res.status(400).json({ error: 'INVALID_INPUT', details: body.error.format() });

        const { articleId } = body.data;

        // 1. Fetch Article
        const article = await prisma.article.findUnique({
            where: { id: articleId },
            select: { id: true, title: true, content: true, aiSummary: true }
        });

        if (!article) return res.status(404).json({ error: 'Article not found' });

        // 2. Return cached if exists
        if (article.aiSummary) {
            return res.json({ summary: article.aiSummary, cached: true });
        }

        // 3. Prepare Prompt
        const textToSummarize = article.content || article.title;
        if (!textToSummarize) return res.status(400).json({ error: 'Article has no content' });

        const messages: any[] = [
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
        const aiResponse = await callPerplexity(messages, AI_MODELS.STANDARD);
        const summary = aiResponse.choices[0]?.message?.content?.trim() || "No summary generated.";

        // 5. Save Result
        await prisma.article.update({
            where: { id: articleId },
            data: { aiSummary: summary }
        });

        res.json({ summary, cached: false });

    } catch (error) {
        console.error('[AI] Summarize error:', error);
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
            select: { id: true, title: true, content: true, factCheckData: true }
        });

        if (!article) return res.status(404).json({ error: 'Article not found' });

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
            title: article.title,
            content: article.content || '',
            citationUrls,
        }, {
            removeOnComplete: false, // Keep result for polling
        });

        // 6. Charge user
        await chargeUser(sess.userId, 'FACT_CHECK_PREMIUM');

        res.json({
            jobId: job.id,
            status: 'processing',
            message: 'Analyse lancée. Utilisez GET /api/ai/fact-check/:jobId pour suivre la progression.',
        });

    } catch (error) {
        console.error('[AI] Fact-check error:', error);
        res.status(500).json({ error: 'Fact-check failed' });
    }
});

// ------------------------------------------------------------------
// GET /api/ai/fact-check/:jobId
// Poll job status for the frontend
// The full pipeline is: live-analysis → source-enrichment → DB write.
// We check the DB as source of truth for completion.
// ------------------------------------------------------------------
router.get('/fact-check/:jobId', async (req, res) => {
    try {
        const sess = await requireSession(req, res);
        if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

        const { jobId } = req.params;

        // First, try to find the job in the queue
        const job = await liveAnalysisQueue.getJob(jobId);

        if (!job) {
            // Job not found — might have been cleaned up. Check DB directly.
            return res.status(404).json({ error: 'Job not found', jobId });
        }

        const articleId = job.data.articleId;

        // Check if the full chain is complete (DB has factCheckData)
        const article = await prisma.article.findUnique({
            where: { id: articleId },
            select: { factCheckScore: true, factCheckData: true }
        });

        if (article?.factCheckData) {
            // Full pipeline complete (live-analysis + source-enrichment)
            // Clean up the job
            try { await job.remove(); } catch { /* already removed */ }

            return res.json({
                status: 'completed',
                result: article.factCheckData,
                score: article.factCheckScore,
            });
        }

        // DB not yet populated. Check job state for error reporting.
        const state = await job.getState();

        if (state === 'failed') {
            const failedReason = job.failedReason || 'Unknown error';
            return res.json({
                status: 'failed',
                error: failedReason,
            });
        }

        // Still processing (live-analysis or source-enrichment in progress)
        res.json({
            status: 'processing',
        });

    } catch (error) {
        console.error('[AI] Fact-check poll error:', error);
        res.status(500).json({ error: 'Poll failed' });
    }
});
