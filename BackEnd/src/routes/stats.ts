// BackEnd/src/routes/stats.ts
import { Router } from 'express';
import { prisma } from '../lib/db';
import { getCurrentUserId } from '../lib/currentUser';
import { checkRateLimit } from '../lib/rateLimiter';

export const router = Router();


// GET /api/stats/top?period=all&take=20
// GET /api/stats/top?period=all&take=20
// GET /api/stats/top?period=all&take=20
router.get('/top', async (req, res, next) => {
  try {
    const take = Math.min(Math.max(parseInt(String(req.query.take ?? '20'), 10) || 20, 1), 50);
    const period = String(req.query.period || 'all').toLowerCase(); // 'all' | '7d' | '30d'

    const orderBy =
      period === '7d'  ? { views7d:  'desc' as const } :
      period === '30d' ? { views30d: 'desc' as const } :
                         { viewsAll: 'desc' as const };

    const rows = await prisma.articleStats.findMany({
      where: {
        // 👉 ne prendre que les articles publiés
        article: { status: 'PUBLISHED' },
      },
      orderBy,
      take,
      include: {
        article: {
          select: {
            id: true,
            slug: true,
            title: true,
            summary: true,
            imageUrl: true,
            createdAt: true,
            category: { select: { name: true } },
            status: true,
          },
        },
      },
    });

    const items = rows
      .filter(r => !!r.article)
      .map(r => ({
        id: r.article.id,
        slug: r.article.slug,
        title: r.article.title,
        excerpt: r.article.summary ?? null,
        imageUrl: r.article.imageUrl ?? null,
        url: `/article/${r.article.slug || r.article.id}`,
        publishedAt: r.article.createdAt.toISOString(),
        category: r.article.category?.name ?? null,
        tags: [],
        views:
          period === '7d'
            ? r.views7d
            : period === '30d'
            ? r.views30d
            : r.viewsAll,
      }));

    res.json({ items });
  } catch (e) {
    next(e);
  }
});

