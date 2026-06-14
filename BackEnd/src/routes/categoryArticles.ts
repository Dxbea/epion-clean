// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import { Router } from 'express';
import { prisma } from '../lib/db.js';

import { env } from '../env.js';

export const router = Router();
const COOKIE_NAME = env.COOKIE_NAME || 'epion_session';

router.get('/:slug/articles', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const take = Math.min(Number(req.query.take ?? 20), 50);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    // CACHE: 5min si anonyme
    if (!req.cookies?.[COOKIE_NAME]) {
      res.set('Cache-Control', 'public, max-age=300');
      res.set('Vary', 'Cookie');
    }

    const category = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
    if (!category) return res.status(404).json({ error: 'Category Not Found' });

    const items = await prisma.article.findMany({
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      where: { status: 'PUBLISHED', categoryId: category.id },
      select: {
        id: true, slug: true, title: true, summary: true, imageUrl: true, createdAt: true,
        category: { select: { id: true, slug: true, name: true } },
      },
    });

    res.json({
      items: items.map(a => ({
        id: a.id,
        slug: a.slug,
        title: a.title,
        excerpt: a.summary ?? null,
        imageUrl: a.imageUrl ?? null,
        url: `/article/${a.slug}`,
        publishedAt: a.createdAt.toISOString(),
        category: a.category?.name ?? null,
      })),
      nextCursor: items.length === take ? items[items.length - 1].id : null,
    });
  } catch (e) { next(e); }
});
// FIN BLOC
