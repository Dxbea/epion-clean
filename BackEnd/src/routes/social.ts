
import { Router } from 'express';
import { prisma } from '../lib/db';
import { getCurrentUserId } from '../lib/currentUser';
import { checkAndIncrement } from '../lib/rateLimiter';

export const router = Router();

/**
 * POST /api/social/articles/:id/repost
 * Toggle Repost:
 * - If exists -> Delete
 * - If not exists -> Create
 */
router.post('/articles/:id/repost', async (req, res, next) => {
    try {
        let userId: string;
        try {
            userId = await getCurrentUserId(req, res);
        } catch {
            return res.status(401).json({ error: 'NO_SESSION' });
        }

        const articleId = String(req.params.id);

        // Rate Limit (Maintenant couplé au quota DB)
        await checkAndIncrement(userId);

        // Check Article
        const article = await prisma.article.findUnique({
            where: { id: articleId },
            select: { id: true, status: true },
        });
        if (!article || article.status !== 'PUBLISHED') {
            return res.status(404).json({ error: 'Article not found' });
        }

        // Check Existing Repost
        const existing = await prisma.repost.findUnique({
            where: {
                userId_articleId: { userId, articleId },
            },
        });

        if (existing) {
            // Toggle OFF
            await prisma.repost.delete({
                where: { id: existing.id },
            });
            return res.json({ reposted: false });
        } else {
            // Toggle ON
            await prisma.repost.create({
                data: { userId, articleId },
            });
            return res.json({ reposted: true });
        }
    } catch (e) {
        next(e);
    }
});

/**
 * GET /api/social/activity
 * Filter by: type='LIKED' | 'DISLIKED' | 'REPOSTED' | 'SAVED' | 'COMMENTS'
 * Pagination: take, cursor
 */
router.get('/activity', async (req, res, next) => {
    try {
        let userId: string;
        try {
            userId = await getCurrentUserId(req, res);
        } catch {
            return res.status(401).json({ error: 'NO_SESSION' });
        }

        const type = String(req.query.type || 'SAVED').toUpperCase();
        const take = Math.min(Math.max(Number(req.query.take) || 20, 1), 50);
        const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

        let items: any[] = [];
        let nextCursor: string | null = null;

        const articleSelect = {
            id: true,
            title: true,
            slug: true,
            summary: true,
            imageUrl: true,
            createdAt: true,
            status: true,
            category: { select: { name: true } }
        };

        // --- SAVED ---
        if (type === 'SAVED') {
            const rows = await prisma.savedArticle.findMany({
                where: { userId, article: { status: 'PUBLISHED' } },
                take: take + 1,
                orderBy: { savedAt: 'desc' },
                cursor: cursor ? { userId_articleId: { userId, articleId: cursor } } : undefined,
                skip: cursor ? 1 : 0,
                select: {
                    article: { select: articleSelect }
                }
            });
            if (rows.length > take) {
                const next = rows.pop();
                nextCursor = next?.article?.id ?? null;
            }
            items = rows.map(r => mapArticle(r.article));
        }

        // --- REPOSTED ---
        else if (type === 'REPOSTED') {
            const rows = await prisma.repost.findMany({
                where: { userId, article: { status: 'PUBLISHED' } },
                take: take + 1,
                orderBy: { createdAt: 'desc' },
                cursor: cursor ? { id: cursor } : undefined,
                skip: cursor ? 1 : 0,
                select: {
                    id: true,
                    article: { select: articleSelect }
                }
            });
            if (rows.length > take) {
                const next = rows.pop();
                nextCursor = next?.id ?? null;
            }
            items = rows.map(r => mapArticle(r.article));
        }

        // --- LIKED ---
        else if (type === 'LIKED') {
            const rows = await prisma.articleReaction.findMany({
                where: { userId, type: 'LIKE', article: { status: 'PUBLISHED' } },
                take: take + 1,
                orderBy: { createdAt: 'desc' },
                cursor: cursor ? { userId_articleId: { userId, articleId: cursor } } : undefined,
                skip: cursor ? 1 : 0,
                select: {
                    articleId: true, // needed for cursor logic if slightly different, but here we use userId_articleId
                    article: { select: articleSelect }
                }
            });
            if (rows.length > take) {
                const next = rows.pop();
                nextCursor = next?.articleId ?? null;
            }
            items = rows.map(r => mapArticle(r.article));
        }

        // --- DISLIKED ---
        else if (type === 'DISLIKED') {
            const rows = await prisma.articleReaction.findMany({
                where: { userId, type: 'DISLIKE', article: { status: 'PUBLISHED' } },
                take: take + 1,
                orderBy: { createdAt: 'desc' },
                cursor: cursor ? { userId_articleId: { userId, articleId: cursor } } : undefined,
                skip: cursor ? 1 : 0,
                select: {
                    articleId: true,
                    article: { select: articleSelect }
                }
            });
            if (rows.length > take) {
                const next = rows.pop();
                nextCursor = next?.articleId ?? null;
            }
            items = rows.map(r => mapArticle(r.article));
        }

        // --- COMMENTS ---
        else if (type === 'COMMENTS') {
            // Pour les commentaires, on renvoie une structure un peu différente
            const rows = await prisma.comment.findMany({
                where: { userId, article: { status: 'PUBLISHED' } },
                take: take + 1,
                orderBy: { createdAt: 'desc' },
                cursor: cursor ? { id: cursor } : undefined,
                skip: cursor ? 1 : 0,
                include: { article: { select: { id: true, title: true, slug: true } } }, // Light article info
            });
            if (rows.length > take) {
                const next = rows.pop();
                nextCursor = next?.id ?? null;
            }
            items = rows.map(c => ({
                id: c.id,
                content: c.content,
                createdAt: c.createdAt.toISOString(),
                article: c.article ? {
                    id: c.article.id,
                    title: c.article.title,
                    url: `/article/${c.article.slug || c.article.id}`
                } : null,
            }));
        }

        res.json({ items, nextCursor });

    } catch (e) {
        next(e);
    }
});

// ... existing code ...

/**
 * POST /api/social/users/:id/follow
 * Toggle Follow/Unfollow user
 */
router.post('/users/:id/follow', async (req, res, next) => {
    try {
        let followerId: string;
        try {
            followerId = await getCurrentUserId(req, res);
        } catch {
            return res.status(401).json({ error: 'NO_SESSION' });
        }

        const followingId = String(req.params.id);

        if (followerId === followingId) {
            return res.status(400).json({ error: 'Cannot follow yourself' });
        }

        // Rate Limit
        // Rate Limit (DB)
        await checkAndIncrement(followerId);
        // Transaction to ensure consistency
        const result = await prisma.$transaction(async (tx) => {
            const existing = await tx.follow.findUnique({
                where: {
                    followerId_followingId: {
                        followerId,
                        followingId,
                    },
                },
            });

            if (existing) {
                // UNFOLLOW
                await tx.follow.delete({
                    where: {
                        followerId_followingId: {
                            followerId,
                            followingId,
                        },
                    },
                });

                // Decrement counts
                await tx.user.update({
                    where: { id: followingId },
                    data: { followersCount: { decrement: 1 } },
                });
                await tx.user.update({
                    where: { id: followerId },
                    data: { followingCount: { decrement: 1 } },
                });

                return { following: false };
            } else {
                // FOLLOW
                await tx.follow.create({
                    data: {
                        followerId,
                        followingId,
                    },
                });

                // Increment counts
                await tx.user.update({
                    where: { id: followingId },
                    data: { followersCount: { increment: 1 } },
                });
                await tx.user.update({
                    where: { id: followerId },
                    data: { followingCount: { increment: 1 } },
                });

                return { following: true };
            }
        });

        // Get updated count to return
        const updatedTarget = await prisma.user.findUnique({
            where: { id: followingId },
            select: { followersCount: true },
        });

        res.json({
            following: result.following,
            followersCount: updatedTarget?.followersCount ?? 0,
        });

    } catch (e) {
        next(e);
    }
});

function mapArticle(a: any) {
    return {
        id: a.id,
        title: a.title,
        excerpt: a.summary ?? null,
        imageUrl: a.imageUrl ?? null,
        url: `/article/${a.slug || a.id}`,
        publishedAt: a.createdAt.toISOString(),
        category: a.category?.name ?? null,
    };
}

