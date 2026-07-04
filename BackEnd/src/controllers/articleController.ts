import { type Request, type Response, type NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { checkArticleQuota, hasSufficientFunds, chargeUser, COSTS } from '../lib/billing-service.js';
import { getCurrentUserId } from '../lib/currentUser.js';
import { logger } from '../lib/logger.js';
import { liveAnalysisQueue } from '../lib/queue.js';
import { transformTextWithAI } from '../services/articleGenerator.js';
import { sanitizeArticleHtml } from '../lib/sanitizeHtml.js';

const ARTICLE_GENERATION_IDEMPOTENCY_WINDOW_MS = 2 * 60 * 1000;
const ARTICLE_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
        .slice(0, 56);
}

function buildPendingGenerationSlug(topic: string): string {
    const base = slugify(topic) || 'article';
    return `${base}-${Date.now().toString(36)}`.slice(0, 64);
}

function normalizeOptionalString(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function generationStatusFromFactCheck(status: string | null | undefined) {
    return status || 'PENDING';
}

export async function createAIArticle(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = await getCurrentUserId(req, res);
        const { topic, category, categoryId, generateImage, imageUrl } = req.body ?? {};
        const normalizedTopic = typeof topic === 'string' ? topic.trim() : '';
        const language = normalizeOptionalString(req.body?.language, 'fr');
        const style = normalizeOptionalString(req.body?.style, 'neutral');
        const normalizedCategory = typeof category === 'string' && category.trim() ? category.trim() : null;

        if (!normalizedTopic) {
            return res.status(400).json({ error: 'Topic is required and must be a string.' });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { emailVerified: true, role: true },
        });

        if (!user || (!user.emailVerified && user.role !== 'ADMIN')) {
            return res.status(403).json({ error: 'Email verification required.' });
        }

        try {
            await checkArticleQuota(userId);
            logger.info('[ArticleGenerate] Weekly quota accepted', { userId });
        } catch (error: any) {
            if (error.message === 'WEEKLY_QUOTA_EXCEEDED') {
                return res.status(403).json({
                    error: "Quota hebdomadaire d'articles atteint.",
                    code: 'QUOTA_ARTICLE_EXCEEDED',
                });
            }
            throw error;
        }

        const idempotencySince = new Date(Date.now() - ARTICLE_GENERATION_IDEMPOTENCY_WINDOW_MS);
        const existingGeneration = await prisma.article.findFirst({
            where: {
                authorId: userId,
                generationPrompt: normalizedTopic,
                factCheckStatus: { in: ['PENDING', 'RUNNING'] },
                createdAt: { gte: idempotencySince },
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, slug: true, status: true, factCheckStatus: true },
        });

        if (existingGeneration) {
            const generationStatus = generationStatusFromFactCheck(existingGeneration.factCheckStatus);
            logger.info('[ArticleGenerate] Reusing pending generation', {
                articleId: existingGeneration.id,
                userId,
                generationStatus,
            });

            return res.status(200).json({
                articleId: existingGeneration.id,
                slug: existingGeneration.slug,
                generationStatus,
                factCheckStatus: existingGeneration.factCheckStatus,
                idempotentReplay: true,
                article: existingGeneration,
            });
        }

        const generationConfig = {
            style,
            language,
            category: normalizedCategory,
            categoryId: typeof categoryId === 'string' && categoryId.trim() ? categoryId.trim() : null,
            generateImage: Boolean(generateImage),
            imageUrl: typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : null,
            asyncGeneration: true,
        };

        const article = await prisma.article.create({
            data: {
                title: sanitizeArticleHtml(normalizedTopic),
                slug: buildPendingGenerationSlug(normalizedTopic),
                summary: null,
                content: null,
                structuredContent: Prisma.JsonNull,
                status: 'DRAFT',
                author: { connect: { id: userId } },
                factCheckStatus: 'PENDING',
                factCheckStartedAt: null,
                factCheckCompletedAt: null,
                factCheckError: null,
                generationPrompt: normalizedTopic,
                generationConfig: generationConfig as any,
                generationVersion: 1,
                imageUrl: generationConfig.imageUrl,
                ...(generationConfig.categoryId
                    ? { category: { connect: { id: generationConfig.categoryId } } }
                    : {}),
            },
            select: { id: true, slug: true, status: true, factCheckStatus: true },
        });

        try {
            const job = await liveAnalysisQueue.add('article-generation', {
                articleId: article.id,
                requestedByUserId: userId,
                title: normalizedTopic,
                content: normalizedTopic,
                citationUrls: [],
                mode: 'article-generation',
                topic: normalizedTopic,
                language,
                style,
                category: normalizedCategory,
                generateImage: Boolean(generateImage),
                imageUrl: generationConfig.imageUrl,
                timeoutMs: ARTICLE_GENERATION_TIMEOUT_MS,
            }, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: 50,
                removeOnFail: 100,
            });

            logger.info('[ArticleGenerate] Generation job queued', {
                articleId: article.id,
                jobId: job.id,
                userId,
            });
        } catch (queueError: any) {
            logger.error('[ArticleGenerate] Generation queue dispatch failed', {
                articleId: article.id,
                userId,
                error: queueError?.message,
            });

            await prisma.article.update({
                where: { id: article.id },
                data: {
                    factCheckStatus: 'FAILED',
                    factCheckError: 'Generation queue dispatch failed',
                    factCheckCompletedAt: new Date(),
                },
            }).catch((updateError: any) => {
                logger.error('[ArticleGenerate] Failed to mark generation dispatch failure', {
                    articleId: article.id,
                    userId,
                    error: updateError?.message,
                });
            });

            return res.status(503).json({
                articleId: article.id,
                slug: article.slug,
                generationStatus: 'FAILED',
                factCheckStatus: 'FAILED',
                error: 'GENERATION_QUEUE_DISPATCH_FAILED',
                article: { ...article, factCheckStatus: 'FAILED' },
            });
        }

        return res.status(201).json({
            articleId: article.id,
            slug: article.slug,
            generationStatus: 'PENDING',
            factCheckStatus: article.factCheckStatus,
            article,
            message: 'Article generation queued.',
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
                error: "Crédits épuisés pour aujourd'hui.",
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
