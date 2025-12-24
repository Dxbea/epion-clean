import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireSession } from '../lib/session';
import { checkRateLimit } from '../lib/rateLimiter';
import { callPerplexity } from '../lib/perplexity';
import { AI_MODELS } from '../config/ai-models';
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

        // Rate Limit: 5 requests per hour per user
        const rl = checkRateLimit(sess.userId, {
            bucket: 'ai:summarize',
            windowMs: 60 * 60 * 1000,
            max: 5
        });
        if (!rl.ok) return res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED', retryAfter: rl.resetMs });

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
// ------------------------------------------------------------------
router.post('/fact-check', async (req, res) => {
    try {
        const sess = await requireSession(req, res);
        if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

        // Rate Limit: 3 requests per hour per user (more expensive)
        const rl = checkRateLimit(sess.userId, {
            bucket: 'ai:factcheck',
            windowMs: 60 * 60 * 1000,
            max: 3
        });
        if (!rl.ok) return res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED', retryAfter: rl.resetMs });

        const body = summarizeSchema.safeParse(req.body);
        if (!body.success) return res.status(400).json({ error: 'INVALID_INPUT', details: body.error.format() });

        const { articleId } = body.data;

        const article = await prisma.article.findUnique({
            where: { id: articleId },
            select: { id: true, title: true, content: true, factCheckData: true }
        });

        if (!article) return res.status(404).json({ error: 'Article not found' });
        if (article.factCheckData) {
            return res.json({ analysis: article.factCheckData, cached: true });
        }

        // 3. Prepare Prompt
        const prompt = `
    Analyze the credibility of this article. Cross-check facts with search.
    
    Article Title: "${article.title}"
    
    Return a valid JSON object (NO MARKDOWN) with this structure:
    {
      "factScore": number (0-100),
      "analysis": "Short text summary of the verification",
      "sources": [ { "name": "Source Name", "domain": "domain.com", "score": 90, "url": "..." } ],
      "scoreBreakdown": [ { "id": "sources", "label": "Qualité Sources", "score": 90, "description": "..." } ]
    }
    `;

        const messages: any[] = [
            {
                role: 'system',
                content: "You are a strict fact-checker. You ONLY return valid JSON. No text outside JSON."
            },
            {
                role: 'user',
                content: prompt
            }
        ];

        const aiResponse = await callPerplexity(messages, AI_MODELS.ADVANCED);
        let rawContent = aiResponse.choices[0]?.message?.content || "{}";

        // Clean markdown
        rawContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();

        let analysisData;
        try {
            analysisData = JSON.parse(rawContent);
        } catch (e) {
            analysisData = {
                factScore: 50,
                analysis: "AI Error: Could not parse analysis response.",
                raw: rawContent
            };
        }

        // Save
        // We cast to any or InputJsonValue because Prisma JSON types can be tricky in TS
        await prisma.article.update({
            where: { id: articleId },
            data: {
                factCheckScore: analysisData.factScore || 0,
                factCheckData: analysisData as Prisma.InputJsonValue
            }
        });

        res.json({ analysis: analysisData, cached: false });

    } catch (error) {
        console.error('[AI] Fact-check error:', error);
        res.status(500).json({ error: 'Fact-check failed' });
    }
});
