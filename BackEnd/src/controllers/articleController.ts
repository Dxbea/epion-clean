import { type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../lib/db';
import { getCurrentUserId } from '../lib/currentUser';
import { generateArticleContent, transformTextWithAI } from '../services/articleGenerator';

export async function createAIArticle(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = await getCurrentUserId(req, res);
        const { topic, language, style, category, generateImage } = req.body;

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

        // 2. Call Generation Service
        const requestData = {
            topic,
            language: language || 'fr',
            style: style || 'neutral',
            category,
            generateImage: !!generateImage
        };

        const generatedData = await generateArticleContent(requestData);

        // 3. Persist to Database
        // Slugify title for URL
        const slugBase = generatedData.title
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
        const uniqueSlug = `${slugBase}-${Date.now().toString().slice(-6)}`;

        // Store imagePrompt in generationConfig
        const generationConfig = {
            style: requestData.style,
            language: requestData.language,
            imagePrompt: generatedData.imagePrompt || null
        };

        // DEBUG: Vérification des données avant sauvegarde
        console.log("--- DEBUG SAVE ARTICLE ---");
        console.log("Sources count:", generatedData.sources?.length);
        console.log("First source sample:", generatedData.sources?.[0]);
        console.log("Score computed:", generatedData.factScore);

        const newArticle = await prisma.article.create({
            data: {
                title: generatedData.title,
                slug: uniqueSlug,
                summary: generatedData.summary,
                content: generatedData.content,
                // Defaulting to draft allows review
                status: 'DRAFT',
                // Author connection (Fix)
                author: {
                    connect: { id: userId }
                },

                // IA Fields
                aiSummary: generatedData.summary,
                factCheckScore: Math.round(generatedData.factScore || 0),
                factCheckData: generatedData.sources, // WARNING: Must be a direct array/object, not wrapped if frontend expects direct access
                generatedAt: new Date(),
                generationPrompt: topic,
                generationConfig: generationConfig, // Stockage de la config et de l'image prompt
                generationVersion: 1,

                // Metadata
                imageUrl: null, // L'image sera générée plus tard via l'imagePrompt stocké

                // Connection de la catégorie si fournie
                category: req.body.categoryId ? {
                    connect: { id: req.body.categoryId }
                } : undefined
            }
        });

        // 4. Return to Frontend
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

        const result = await transformTextWithAI(instruction, currentContent || '', field);

        // 3. Sauvegarde (Mise à jour Prisma)
        // On s'assure que le field est valide
        const allowedFields = ['title', 'summary', 'content'];
        if (field && allowedFields.includes(field)) {
            await prisma.article.update({
                where: { id },
                data: {
                    [field]: result
                }
            });
        }

        return res.json({ result });

    } catch (error) {
        next(error);
    }
}

