import { type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../lib/db';
import { getCurrentUserId } from '../lib/currentUser';
import { transformTextWithAI } from '../services/articleGenerator';
import { runLiveAnalysisWithGeneration } from '../lib/live-analysis';
import { getWikipediaImage } from '../lib/images/wikipedia-fetcher';

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

        // 2. Call Generation Service (Synchronous LiveAnalysis Pipeline)
        const result = await runLiveAnalysisWithGeneration(topic, {
            language: language || 'fr',
            style: style || 'neutral'
        });

        if (!result.generatedContent) {
            return res.status(500).json({ error: "L'IA n'a pas pu générer l'article." });
        }

        const generatedData = result.generatedContent;

        let coverImageUrl: string | null = imageUrl || null;
        if (generateImage && generatedData.wikipedia_search_query) {
            const wikiImg = await getWikipediaImage(generatedData.wikipedia_search_query);
            if (wikiImg) {
                coverImageUrl = wikiImg;
            }
        }

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
            style: style || 'neutral',
            language: language || 'fr',
            imagePrompt: generatedData.imagePrompt || null
        };

        // Initialize sources as PENDING for the frontend
        const sources = (result.sources || []).map((s, idx) => {
            return {
                id: idx + 1,
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
            liveAnalysis: {
                contentIntent: result.contentIntent,
                pillarScores: result.pillarScores,
                judges: result.judges,
            },
            sources: sources
        };

        // DEBUG: Vérification des données avant sauvegarde
        console.log("--- DEBUG SAVE ARTICLE ---");
        console.log("Sources count:", sources.length);
        console.log("Score computed:", result.globalScore);

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

        // 4. Background Job: Source Enrichment
        // Since LiveAnalysis is synchronous, we directly chain to source enrichment
        const citationUrls = (result.sources || []).map(s => s.url);

        console.log(`[Controller] Dispatching source enrichment for article ${newArticle.id} (${citationUrls.length} citation URLs)`);

        import('../lib/queue').then(({ sourceEnrichmentQueue }) => {
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
            }).catch(err => console.error('[Controller] source enrichment queue dispatch failed:', err));
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

