// BackEnd/src/routes/favorites.ts
import { Router } from 'express';
import { prisma } from '../lib/db';
import { getCurrentUserId } from '../lib/currentUser';
import { checkRateLimit } from '../lib/rateLimiter';

export const router = Router();

const FAVORITES_LIMITS = {
  maxTotalPerUser: 2000,  // quota global de favoris par compte
  maxOpsPerMinute: 240,   // nombre max d’opérations / minute
};

/**
 * Petite utilitaire : vérifier que l’article existe ET est publié
 * - renvoie null sinon
 */
async function ensurePublishedArticle(articleId: string) {
  const a = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true, status: true },
  });
  if (!a || a.status !== 'PUBLISHED') return null;
  return a;
}

/**
 * GET /api/favorites/ids
 * -> renvoie simplement la liste des IDs d’articles favoris pour le user courant
 *    { ids: string[] }
 */
router.get('/ids', async (req, res, next) => {
  try {
    let userId: string;
    try {
      userId = await getCurrentUserId(req, res);
    } catch {
      // invité -> on reste cohérent avec useSavedArticles (401 -> pas d’IDs serveur)
      return res.status(401).json({ error: 'NO_SESSION' });
    }

    const rows = await prisma.savedArticle.findMany({
      where: { userId },
      select: { articleId: true },
    });

    res.json({ ids: rows.map((r) => r.articleId) });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/favorites?take=24&cursor=ARTICLE_ID_OPTIONNEL
 * -> renvoie les articles favoris (type ArticleCard attendu par le front)
 */
router.get('/', async (req, res, next) => {
  try {
    let userId: string;
    try {
      userId = await getCurrentUserId(req, res);
    } catch {
      return res.status(401).json({ error: 'NO_SESSION' });
    }

    const take = Math.min(
      Math.max(parseInt(String(req.query.take ?? '24'), 10) || 24, 1),
      50
    );
    const cursor =
      typeof req.query.cursor === 'string' ? req.query.cursor : null;

    const rows = await prisma.savedArticle.findMany({
      where: {
        userId,
        // on ne renvoie que les articles publiés
        article: { status: 'PUBLISHED' },
      },
      take: take + 1,
      ...(cursor
        ? {
            cursor: { userId_articleId: { userId, articleId: cursor } },
            skip: 1,
          }
        : {}),
      orderBy: { savedAt: 'desc' },
      select: {
        articleId: true,
        article: {
          select: {
            id: true,
            slug: true,
            title: true,
            summary: true,
            imageUrl: true,
            createdAt: true,
            category: { select: { name: true, slug: true } },
            stats: { select: { viewsAll: true } },
          },
        },
      },
    });

    const hasMore = rows.length > take;
    const slice = rows.slice(0, take);

    const items = slice
      .map((r) => {
        const a = r.article;
        if (!a) return null;
        return {
          id: a.id,
          title: a.title,
          excerpt: a.summary ?? null,
          imageUrl: a.imageUrl ?? null,
          url: `/article/${a.slug || a.id}`,
          publishedAt: a.createdAt.toISOString(),
          category: a.category?.name ?? null,
          tags: [] as string[],
          views: a.stats?.viewsAll ?? 0,
        };
      })
      .filter(Boolean);

    const nextCursor =
      hasMore && slice.length > 0 ? slice[slice.length - 1]!.articleId : null;

    res.json({ items, nextCursor });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/favorites/:id
 * -> ajoute un article aux favoris (avec limites et contrôles)
 */
router.post('/:id', async (req, res, next) => {
  try {
    let userId: string;
    try {
      userId = await getCurrentUserId(req, res);
    } catch {
      return res.status(401).json({ error: 'NO_SESSION' });
    }

    const articleId = String(req.params.id);

    // rate-limit sur les opérations de favoris
    const rl = checkRateLimit(`favorites:${userId}`, {
      bucket: 'favorites:toggle',
      windowMs: 60_000,
      max: FAVORITES_LIMITS.maxOpsPerMinute,
    });
    if (!rl.ok) {
      return res.status(429).json({
        error: 'rate_limit_favorites',
        message:
          'Tu modifies tes favoris trop vite. Attends quelques instants avant de réessayer.',
        retryInMs: rl.resetMs,
      });
    }

    // article doit exister et être publié
    const article = await ensurePublishedArticle(articleId);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // quota global
    const total = await prisma.savedArticle.count({ where: { userId } });
    if (total >= FAVORITES_LIMITS.maxTotalPerUser) {
      return res.status(400).json({
        error: 'favorites_quota_reached',
        message:
          'Tu as atteint le nombre maximal d’articles enregistrés. Supprime-en quelques-uns avant d’en ajouter de nouveaux.',
        limit: FAVORITES_LIMITS.maxTotalPerUser,
      });
    }

    // si déjà dans les favoris → on ne recrée pas (idempotent)
    const exists = await prisma.savedArticle.findUnique({
      where: {
        userId_articleId: { userId, articleId },
      },
      select: { userId: true },
    });
    if (exists) {
      return res.status(200).json({ saved: true });
    }

    await prisma.savedArticle.create({
      data: {
        userId,
        articleId,
      },
    });

    res.status(201).json({ saved: true });
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /api/favorites/:id
 * -> retire un article des favoris (idempotent)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    let userId: string;
    try {
      userId = await getCurrentUserId(req, res);
    } catch {
      return res.status(401).json({ error: 'NO_SESSION' });
    }

    const articleId = String(req.params.id);

    // même rate-limit que pour POST
    const rl = checkRateLimit(`favorites:${userId}`, {
      bucket: 'favorites:toggle',
      windowMs: 60_000,
      max: FAVORITES_LIMITS.maxOpsPerMinute,
    });
    if (!rl.ok) {
      return res.status(429).json({
        error: 'rate_limit_favorites',
        message:
          'Tu modifies tes favoris trop vite. Attends quelques instants avant de réessayer.',
        retryInMs: rl.resetMs,
      });
    }

    await prisma.savedArticle
      .delete({
        where: {
          userId_articleId: { userId, articleId },
        },
      })
      .catch(() => {
        // idempotent : si pas trouvé, on ignore
      });

    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
