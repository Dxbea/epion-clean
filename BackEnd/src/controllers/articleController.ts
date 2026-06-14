import { type Request, type Response, type NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { checkArticleQuota, hasSufficientFunds, chargeUser, COSTS } from '../lib/billing-service.js';
import { getCurrentUserId } from '../lib/currentUser.js';
import { logger } from '../lib/logger.js';
import { sourceEnrichmentQueue } from '../lib/queue.js';
import { transformTextWithAI } from '../services/articleGenerator.js';
import { runLiveAnalysisWithGeneration } from '../lib/live-analysis/index.js';
import { getArticleImageProposals } from '../lib/images/proposals.js';
import { stableSourceId } from '../lib/structured-article.js';

export async function createAIArticle(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = await getCurrentUserId(req, res);
        const { topic, language, style, category, generateImage, imageUrl } = req.body;

        if (!topic || typeof topic !== 'string') {
            return res.status(400).json({ error: 'Topic is required and must be a string.' });
        }

        // 1. Auth & Verification Checks
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { emailVerifiedAt: true, role: true }
        });

        if (!user || (!user.emailVerifiedAt && user.role !== 'ADMIN')) {
            return res.status(403).json({ error: 'Email verification required.' });
        }

        // 2. Weekly quota / billing gate
        try {
            await checkArticleQuota(userId);
            logger.info('[ArticleGenerate] Weekly quota accepted', { userId });
        } catch (error: any) {
            if (error.message === 'WEEKLY_QUOTA_EXCEEDED') {
                return res.status(403).json({
                    error: "Quota hebdomadaire d'articles atteint.",
                    code: "QUOTA_ARTICLE_EXCEEDED"
                });
            }
            throw error;
        }

        // 3. Call Generation Service (Synchronous LiveAnalysis Pipeline)
        const result = await runLiveAnalysisWithGeneration(topic, {
            language: language || 'fr',
            style: style || 'neutral'
        });

        if (!result.generatedContent) {
            return res.status(500).json({ error: "L'IA n'a pas pu générer l'article." });
        }

        const generatedData = result.generatedContent;

        let coverImageUrl: string | null = imageUrl || null;
        if (generateImage) {
            const topicOrWikiQuery = generatedData.wikipedia_search_query || generatedData.title;
            const articleLang = language || 'fr';
            const sourceUrls = result.sources?.map((s: any) => s.url).filter((u: any) => u) || [];
            const proposals = await getArticleImageProposals(sourceUrls, topicOrWikiQuery, articleLang);
            if (proposals.length > 0) {
                coverImageUrl = proposals[0].url;
            }
        }

        // 4. Persist to Database
        // Slugify title for URL
        const slugBase = generatedData.title
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
        const uniqueSlug = `${slugBase}-${Date.now().toString().slice(-6)}`;

        // Store imagePrompt and wikipedia_search_query in generationConfig
        const generationConfig = {
            style: style || 'neutral',
            language: language || 'fr',
            imagePrompt: generatedData.imagePrompt || null,
            wikipedia_search_query: generatedData.wikipedia_search_query || null
        };

        // Initialize sources as PENDING for the frontend
        const sources = (result.sources || []).map((s, idx) => {
            const sourceId = stableSourceId(s.url, idx);
            return {
                id: idx + 1,
                sourceId,
                name: s.domain || 'Source inconnue',
                url: s.url,
                domain: s.domain,
                trustScore: null,
                flags: null,
                type: 'PENDING',
                logo: `https://logo.clearbit.com/${s.domain}`,
                description: 'Analyse en cours...',
                metrics: null
            };
        });

        // Object containing both the LiveAnalysis data and pending sources
        const initialFactCheckData = {
            factScore: Math.round(result.globalScore || 50),
            liveScore: Math.round(result.globalScore || 50),
            sourcesMean: null,
            calculation: {
                formula: 'weighted-source-live-v1',
                sourceWeight: 0.75,
                liveWeight: 0.25,
                sourcesMean: null,
                liveScore: Math.round(result.globalScore || 50),
                finalScore: Math.round(result.globalScore || 50),
            },
            liveAnalysis: {
                contentIntent: result.contentIntent,
                pillarScores: result.pillarScores,
                judges: result.judges,
            },
            sources: sources
        };

        // DEBUG: Vérification des données avant sauvegarde
        logger.info('[ArticleGenerate] Article payload ready for save', {
            userId,
            sourceCount: sources.length,
            score: result.globalScore
        });

        const newArticle = await prisma.article.create({
            data: {
                title: generatedData.title,
                slug: uniqueSlug,
                summary: generatedData.summary,
                content: generatedData.content,
                structuredContent: generatedData.structuredContent as any,
                // Defaulting to draft allows review
                status: 'DRAFT',
                // Author connection (Fix)
                author: {
                    connect: { id: userId }
                },

                // IA Fields
                aiSummary: generatedData.summary,
                factCheckScore: Math.round(result.globalScore || 50),
                factCheckData: initialFactCheckData as any,
                generatedAt: new Date(),
                generationPrompt: topic,
                generationConfig: generationConfig, // Stockage de la config et de l'image prompt
                generationVersion: 1,

                // Metadata
                imageUrl: coverImageUrl, // Generated directly from Wikipedia fetcher

                // Connection de la catégorie si fournie
                category: req.body.categoryId ? {
                    connect: { id: req.body.categoryId }
                } : undefined
            }
        });
        logger.info('[ArticleGenerate] Article created', {
            articleId: newArticle.id,
            userId,
            status: newArticle.status
        });

        // 5. Background Job: Source Enrichment
        // Since LiveAnalysis is synchronous, we directly chain to source enrichment
        const citationUrls = (result.sources || []).map(s => s.url);

        logger.info('[ArticleGenerate] Queueing source enrichment', {
            articleId: newArticle.id,
            citationUrlCount: citationUrls.length
        });
        sourceEnrichmentQueue.add('enrich', {
            articleId: newArticle.id,
            sources: citationUrls,
            scoreLiveBrut: result.globalScore,
            liveAnalysis: {
                contentIntent: result.contentIntent,
                pillarScores: result.pillarScores,
                judges: result.judges,
            },
        }, {
            removeOnComplete: true,
            attempts: 2
        }).then(() => {
            logger.info('[ArticleGenerate] Source enrichment queued', {
                articleId: newArticle.id
            });
        }).catch(err => {
            logger.error('[ArticleGenerate] Source enrichment queue dispatch failed', {
                articleId: newArticle.id,
                error: err.message
            });
        });

        // 6. Return to Frontend
        return res.status(201).json({
            article: newArticle,
            message: "Article generated successfully."
        });

    } catch (error) {
        next(error);
    }

}

export async function editAIArticle(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = await getCurrentUserId(req, res);
        const { id } = req.params;
        const { instruction, currentContent, field } = req.body;

        if (!instruction) {
            return res.status(400).json({ error: 'Missing instruction' });
        }
        // currentContent can be empty if we are generating from scratch

        // Verify ownership
        const article = await prisma.article.findUnique({
            where: { id },
            select: { authorId: true }
        });

        if (!article) return res.status(404).json({ error: 'Not Found' });
        if (article.authorId !== userId) {
            // Check admin? For now strict ownership
            const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
            if (user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
        }

        const hasCredits = await hasSufficientFunds(userId, 'CHAT_FAST');
        if (!hasCredits) {
            return res.status(402).json({
                error: "CrÃ©dits Ã©puisÃ©s pour aujourd'hui.",
                code: "QUOTA_TOTAL",
                cost: COSTS.CHAT_FAST,
            });
        }

        const result = await transformTextWithAI(instruction, currentContent || '', field);

        // 3. Sauvegarde (Mise à jour Prisma)
        // On s'assure que le field est valide
        const allowedFields = ['title', 'summary', 'content'];
        if (field && allowedFields.includes(field)) {
            await prisma.article.update({
                where: { id },
                data: {
                    [field]: result,
                    ...(field === 'content' ? { structuredContent: Prisma.JsonNull } : {}),
                }
            });
        }

        await chargeUser(userId, 'CHAT_FAST');

        return res.json({ result });

    } catch (error) {
        next(error);
    }
}

