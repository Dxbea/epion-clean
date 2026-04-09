// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import { Router } from 'express';
import { prisma } from '../lib/db';
import { ArticleStatus, Prisma } from '@prisma/client';
// import { pickDefaultImage } from '../lib/defaultImages';
import { getCurrentUserId, getCurrentUser } from '../lib/currentUser';
import { getViewerHash } from '../lib/viewer';
import { ARTICLE_LIMITS } from '../config/articleLimits';
import { checkAndIncrement } from '../lib/rateLimiter';
import { checkArticleQuota } from '../lib/billing-service';
import { ingestArticle } from '../lib/rag-service';
import { sanitizeArticleHtml } from '../lib/sanitizeHtml';
import { logger } from '../lib/logger';
import { embeddingQueue } from '../lib/queue';


import { env } from '../env';
import { getArticleImageProposals } from '../lib/images/proposals';

export const router = Router();
const COOKIE_NAME = env.COOKIE_NAME || 'epion_session';

// --- GET /api/articles/:id/image-proposals ---------------------------
router.get('/:id/image-proposals', async (req, res, next) => {
  try {
    const { id } = req.params;
    let currentUserId: string;
    try {
      currentUserId = await getCurrentUserId(req, res);
    } catch {
      return res.status(401).json({ error: 'NO_SESSION' });
    }

    const a = await prisma.article.findUnique({
      where: { id },
      select: { authorId: true, title: true, generationPrompt: true, factCheckData: true, generationConfig: true }
    });

    if (!a) return res.status(404).json({ error: 'Not Found' });

    if (a.authorId !== currentUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const config: any = a.generationConfig || {};
    const topic = config.wikipedia_search_query || a.title;
    const lang = config.language || 'en'; // Extract language
    let sourceUrls: string[] = [];
    if (a.factCheckData) {
      const factData: any = a.factCheckData;
      const sources = Array.isArray(factData) ? factData : (factData.sources || []);
      sourceUrls = sources.map((s: any) => s.url).filter((u: any) => u);
    }

    const proposals = await getArticleImageProposals(sourceUrls, topic, lang);
    res.json({ proposals });
  } catch (err) {
    next(err);
  }
});

// --- PUT /api/articles/:id  (update) ---------------------------------
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    let currentUserId: string;
    try {
      currentUserId = await getCurrentUserId(req, res);
    } catch {
      return res.status(401).json({ error: 'NO_SESSION' });
    }

    const existing = await prisma.article.findUnique({
      where: { id },
      select: { authorId: true },
    });
    if (!existing) return res.status(404).json({ error: 'Not Found' });

    if (existing.authorId !== currentUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const {
      title,
      summary,
      content,
      imageUrl,
      status,     // 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' (optionnel)
      categoryId, // optionnel
    } = req.body ?? {};

    const limits = ARTICLE_LIMITS;

    // gardes-fous simples
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length < 3) {
        return res.status(400).json({
          error: 'article_title_too_short',
          message: 'Le titre doit faire au moins 3 caractères.',
        });
      }
      if (title.length > limits.maxTitleChars) {
        return res.status(400).json({
          error: 'article_title_too_long',
          message: `Le titre est trop long (> ${limits.maxTitleChars} caractères).`,
        });
      }
    }

    if (typeof summary === 'string' && summary.length > limits.maxSummaryChars) {
      return res.status(400).json({
        error: 'article_summary_too_long',
        message: `Le chapo est trop long (> ${limits.maxSummaryChars} caractères).`,
      });
    }

    if (typeof content === 'string' && content.length > limits.maxContentChars) {
      return res.status(400).json({
        error: 'article_content_too_long',
        message: `Le contenu est trop long (> ${limits.maxContentChars} caractères).`,
      });
    }

    const data: Prisma.ArticleUpdateInput = {
      ...(title !== undefined
        ? { title: sanitizeArticleHtml(String(title)) }
        : {}),
      ...(typeof summary === 'string'
        ? { summary: sanitizeArticleHtml(summary) }
        : summary === null
          ? { summary: null }
          : {}),
      ...(typeof content === 'string'
        ? { content: sanitizeArticleHtml(content) }
        : content === null
          ? { content: null }
          : {}),
      ...(typeof imageUrl === 'string' || imageUrl === null
        ? { imageUrl: typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : null }
        : {}),
      ...(status ? { status: status as any } : {}),
      ...(categoryId
        ? { category: { connect: { id: String(categoryId) } } }
        : categoryId === null
          ? { category: { disconnect: true } }
          : {}),
    };


    const updated = await prisma.article.update({
      where: { id },
      data,
      select: { id: true, slug: true },
    });

    // 🧠 RAG: Async Queue (BullMQ)
    // On met à jour l'article, donc on demande de refaire l'embedding
    embeddingQueue.add('generate-vector', { articleId: updated.id }).catch(err =>
      logger.error('Queue Add Failed', { error: err.message })
    );

    res.json(updated);
  } catch (e) {
    if ((e as any)?.code === 'P2025') {
      return res.status(404).json({ error: 'Not Found' });
    }
    next(e);
  }
});



// --- DELETE /api/articles/:id  ---------------------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    let userId: string;
    try {
      userId = await getCurrentUserId(req, res);
    } catch {
      return res.status(401).json({ error: 'NO_SESSION' });
    }
    const existing = await prisma.article.findUnique({
      where: { id },
      select: { authorId: true },
    });
    if (!existing) return res.status(404).json({ error: 'Not Found' });

    if (existing.authorId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await prisma.article.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    if ((e as any)?.code === 'P2025') return res.status(404).json({ error: 'Not Found' });
    next(e);
  }
});



/** slug basique (sans garantie d'unicité) */
function slugify(title: string) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 64);
}

/**
 * Génère un slug unique pour un titre donné.
 * - nettoie le titre
 * - si collision -> ajoute -2, -3, ... en restant <= 64 caractères
 */
async function buildUniqueSlug(title: string): Promise<string> {
  const MAX_LEN = 64;

  let base = slugify(title);
  if (!base) {
    base = 'article';
  }

  let slug = base;
  let suffix = 1;

  while (true) {
    const existing = await prisma.article.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing) {
      return slug;
    }

    const suffixStr = `-${suffix++}`;
    const allowedBaseLen = Math.max(1, MAX_LEN - suffixStr.length);
    const truncatedBase = base.slice(0, allowedBaseLen);
    slug = `${truncatedBase}${suffixStr}`;
  }
}

/** fallback author */
async function getDefaultAuthorId(): Promise<string> {
  const first = await prisma.user.findFirst({ select: { id: true } });
  if (first) return first.id;
  const created = await prisma.user.create({
    data: { email: 'seed@local.test', name: 'Seed User', role: 'ADMIN' },
    select: { id: true },
  });
  return created.id;
}



// DEBUT BLOC (remplace seulement ce handler GET /top)
router.get('/top', async (req, res, next) => {
  try {
    // CACHE: 5min si anonyme
    if (!req.cookies?.[COOKIE_NAME]) {
      res.set('Cache-Control', 'public, max-age=300');
      res.set('Vary', 'Cookie');
    }

    // --- petit rate-limit sur les tops ---
    let key = `ip:${req.ip}`;
    try {
      const user = await getCurrentUser(req, res);
      if (user) {
        key = `user:${user.id}`;
      }
    } catch {
      // en cas d'erreur inattendue, on reste sur la clé IP
    }

    // --- petit rate-limit sur les tops (DB) ---
    // Gère "ip:..." et "user:..."
    await checkAndIncrement(key);

    const take = Math.min(
      Math.max(parseInt(String(req.query.take ?? '6'), 10) || 6, 1),
      24
    );
    const period = String(req.query.period || '7d').toLowerCase();

    if (period === 'all') {
      const rows = await prisma.articleStats.findMany({
        orderBy: { viewsAll: 'desc' },
        take,
        include: {
          article: {
            include: { category: true },
          },
        },
        where: {
          article: { status: 'PUBLISHED' }, // 🔐 uniquement publiés
        },
      });

      const items = rows
        .filter((r) => !!r.article)
        .map((r) => {
          const a = r.article!;
          return {
            id: a.id,
            title: a.title,
            excerpt: a.summary ?? null,
            imageUrl: a.imageUrl ?? null,
            url: `/article/${a.slug || a.id}`,
            publishedAt: a.createdAt.toISOString(),
            category: a.category?.name ?? null,
            tags: [],
            views: r.viewsAll,
          };
        });

      return res.json({ items });
    }

    // period=7d (par défaut) — on compte sur ArticleView
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let grouped = await prisma.articleView.groupBy({
      by: ['articleId'],
      where: { createdAt: { gte: since } },
      _count: { articleId: true },
      orderBy: { _count: { articleId: 'desc' } },
      take,
    });

    // --- FALLBACK: If no views in last 7 days, take all-time top or most recent ---
    if (grouped.length === 0) {
      const fallbackRows = await prisma.articleStats.findMany({
        orderBy: { viewsAll: 'desc' },
        take,
        where: { article: { status: 'PUBLISHED' } },
        select: { articleId: true, viewsAll: true }
      });

      let items = await Promise.all(fallbackRows.map(async (f) => {
        const a = await prisma.article.findUnique({
          where: { id: f.articleId },
          include: { category: true }
        });
        if (!a) return null;
        return {
          id: a.id,
          title: a.title,
          excerpt: a.summary ?? null,
          imageUrl: a.imageUrl ?? null,
          url: `/article/${a.slug || a.id}`,
          publishedAt: a.createdAt.toISOString(),
          category: a.category?.name ?? null,
          tags: [],
          views: f.viewsAll,
        };
      }));

      items = items.filter(Boolean);

      // --- SECOND FALLBACK: If still nothing, just take any published articles ---
      if (items.length === 0) {
        const anyPublished = await prisma.article.findMany({
          where: { status: 'PUBLISHED' },
          orderBy: { createdAt: 'desc' },
          take,
          include: { category: true },
        });

        items = anyPublished.map((a) => ({
          id: a.id,
          title: a.title,
          excerpt: a.summary ?? null,
          imageUrl: a.imageUrl ?? null,
          url: `/article/${a.slug || a.id}`,
          publishedAt: a.createdAt.toISOString(),
          category: a.category?.name ?? null,
          tags: [],
          views: 0,
        })) as any;
      }

      return res.json({ items });
    }

    const ids = grouped.map((g) => g.articleId);
    if (ids.length === 0) return res.json({ items: [] });

    const articles = await prisma.article.findMany({
      where: {
        id: { in: ids },
        status: 'PUBLISHED', // 🔐 ici aussi
      },
      include: { category: true },
    });

    const items = ids
      .map((id) => {
        const a = articles.find((x) => x.id === id);
        if (!a) return null;
        const cnt =
          grouped.find((x) => x.articleId === id)?._count.articleId || 0;
        return {
          id: a.id,
          title: a.title,
          excerpt: a.summary ?? null,
          imageUrl: a.imageUrl ?? null,
          url: `/article/${a.slug || a.id}`,
          publishedAt: a.createdAt.toISOString(),
          category: a.category?.name ?? null,
          tags: [],
          views: cnt,
        };
      })
      .filter(Boolean);

    res.json({ items });
  } catch (e) {
    next(e);
  }
});
// FIN BLOC


// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
/** GET /api/articles — liste paginée (publique: uniquement PUBLISHED) */
// DEBUT BLOC (remplace seulement ce handler GET /)
// DEBUT BLOC (remplace seulement ce handler GET /)
router.get('/', async (req, res, next) => {
  try {
    // CACHE: 60s si anonyme (+stale 30s)
    // On ne cache pas si status=ALL (car admin) mais le check cookie couvre déjà ça (admin = connecté)
    if (!req.cookies?.[COOKIE_NAME]) {
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
      res.set('Vary', 'Cookie');
    }

    const rawTake = Number(req.query.take ?? 20);
    const take = Math.min(
      Math.max(Number.isFinite(rawTake) ? rawTake : 20, 1),
      50
    );
    const cursor =
      typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const statusParam =
      typeof req.query.status === 'string'
        ? req.query.status.toUpperCase()
        : 'PUBLISHED';
    const authorId = typeof req.query.authorId === 'string' ? req.query.authorId.trim() : undefined;

    // 🔐 Par défaut, on ne renvoie que les PUBLISHED
    let where: Prisma.ArticleWhereInput = { status: 'PUBLISHED' };

    // Cas particulier: status=ALL mais seulement pour les admin
    if (statusParam === 'ALL') {
      try {
        const user = await getCurrentUser(req, res);
        if (user) {
          const u = await prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true },
          });
          if (u?.role === 'ADMIN') {
            where = {}; // admin: tous les statuts
          }
        }
      } catch {
        // en cas d'erreur, on reste sur PUBLISHED
      }
    }

    // Filtre par auteur si demandé
    if (authorId) {
      where.authorId = authorId;
    }

    const raw = await prisma.article.findMany({
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        content: true,
        imageUrl: true,
        status: true,
        createdAt: true,
        category: { select: { id: true, slug: true, name: true } },
        author: { select: { id: true, email: true, name: true, username: true, avatarUrl: true } },
      },
    });

    const items = raw.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      excerpt: a.summary ?? null,
      content: a.content ?? null,
      imageUrl: a.imageUrl ?? null,
      status: a.status,
      publishedAt: a.createdAt.toISOString(),
      category: a.category
        ? {
          id: a.category.id,
          slug: a.category.slug,
          name: a.category.name,
        }
        : null,
      author: a.author,
    }));

    const nextCursor = raw.length === take ? raw[raw.length - 1].id : null;

    res.json({ items, nextCursor });
  } catch (err) {
    next(err);
  }
});

/** GET /api/articles/following — Flux des personnes suivies */
router.get('/following', async (req, res, next) => {
  try {
    let userId: string;
    try {
      userId = await getCurrentUserId(req, res);
    } catch {
      // Pour les invités, on renvoie une liste vide sans erreur
      return res.json({ items: [], nextCursor: null });
    }

    const rawTake = Number(req.query.take ?? 12);
    const take = Math.min(Math.max(rawTake, 1), 50);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    // Trouver les IDs des personnes suivies
    const followings = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = followings.map((f) => f.followingId);

    if (followingIds.length === 0) {
      return res.json({ items: [], nextCursor: null });
    }

    const raw = await prisma.article.findMany({
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      where: {
        authorId: { in: followingIds },
        status: 'PUBLISHED',
      },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        imageUrl: true,
        createdAt: true,
        category: { select: { name: true } },
        author: { select: { id: true, name: true, username: true, avatarUrl: true } },
      },
    });

    const items = raw.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      excerpt: a.summary ?? null,
      imageUrl: a.imageUrl ?? null,
      publishedAt: a.createdAt.toISOString(),
      category: a.category?.name ?? null,
      author: a.author,
      url: `/article/${a.slug || a.id}`,
    }));

    const nextCursor = raw.length === take ? raw[raw.length - 1].id : null;

    res.json({ items, nextCursor });
  } catch (err) {
    next(err);
  }
});
// FIN BLOC

// Petit endpoint de prévisualisation de slug
// GET /api/articles/slug-preview?base=... ou ?title=...
router.get('/slug-preview', async (req, res, next) => {
  try {
    const rawBase =
      (typeof req.query.base === 'string' && req.query.base) ||
      (typeof req.query.title === 'string' && req.query.title) ||
      '';

    if (!rawBase.trim()) {
      return res.status(400).json({ error: 'missing_base', message: 'Missing base for slug.' });
    }

    const slug = await buildUniqueSlug(rawBase);
    res.json({ slug });
  } catch (e) {
    next(e);
  }
});




// DEBUT BLOC (remplace tout le handler GET /slug/:slug)
router.get('/slug/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;

    // ATTENTION : On ne peut pas mettre le cache tout de suite
    // car on ne sait pas encore si l'article est PUBLISHED.
    // Mais si pas de cookie, on est anonyme, donc on ne verra QUE du published.
    // Donc Safe de mettre le header, car si 404/403, le cache ne s'appliquera pas pareil (ou on s'en fiche).
    // => On met le cache conditionnel, et si on renvoie une erreur, Express/Client gérera.

    if (!req.cookies?.[COOKIE_NAME]) {
      res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=600');
      res.set('Vary', 'Cookie');
    }

    // 1) essai exact
    let a = await prisma.article.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        content: true,
        imageUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        authorId: true,
        category: { select: { id: true, slug: true, name: true } },
        author: { select: { id: true, email: true, name: true, username: true, avatarUrl: true } },
        // AI Fields
        aiSummary: true,
        factCheckScore: true,
        factCheckData: true,
        generationPrompt: true,
      },
    });

    // 2) essai insensible à la casse
    if (!a) {
      a = await prisma.article.findFirst({
        where: { slug: { equals: slug, mode: 'insensitive' } },
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          content: true,
          imageUrl: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          authorId: true,
          category: { select: { id: true, slug: true, name: true } },
          author: { select: { id: true, email: true, name: true, username: true, avatarUrl: true } },
          // AI Fields
          aiSummary: true,
          factCheckScore: true,
          factCheckData: true,
          generationPrompt: true,
        },
      });
    }

    // FORCE NO CACHE DEBUG
    res.set('Cache-Control', 'no-store');

    if (a) {
      console.log(`[GET /slug/${slug}] Found via primary lookup. FactCheckScore:`, a.factCheckScore);
      if (a.factCheckData) {
        const fcd: any = a.factCheckData;
        const sources = Array.isArray(fcd) ? fcd : (fcd.sources || []);
        console.log(`[GET /slug/${slug}] Sources sample:`, sources.map((s: any) => ({ domain: s.domain, score: s.trustScore || s.score })));
      }
    }


    // 3) fallback ancien lien par id
    if (!a) {
      a = await prisma.article.findUnique({
        where: { id: slug },
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          content: true,
          imageUrl: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          authorId: true,
          category: { select: { id: true, slug: true, name: true } },
          author: { select: { id: true, email: true, name: true, username: true, avatarUrl: true } },
          // AI Fields
          aiSummary: true,
          factCheckScore: true,
          factCheckData: true,
          generationPrompt: true,
        },
      });
    }

    // pas trouvé du tout
    if (!a) {
      return res.status(404).json({ error: 'Not Found' });
    }

    // --- DEBUG CRITIQUE ---
    logger.debug('Get Article Debug', {
      module: 'Articles',
      slug: a.slug,
      hasFactCheckData: !!a.factCheckData,
      factCheckDataSample: a.factCheckData ? JSON.stringify(a.factCheckData).slice(0, 100) : null
    });

    // Mapping de sécurité pour le frontend (garantit que .sources existe)
    const responseData = {
      id: a.id,
      slug: a.slug,
      title: a.title,
      excerpt: a.summary ?? null,
      content: a.content ?? null,
      imageUrl: a.imageUrl ?? null,
      status: a.status,
      publishedAt: a.createdAt.toISOString(),
      category: a.category
        ? { id: a.category.id, slug: a.category.slug, name: a.category.name }
        : null,
      author: a.author,
      // AI Fields
      aiSummary: a.aiSummary,
      factCheckScore: a.factCheckScore,
      factCheckData: a.factCheckData,
      sources: (a as any).sources || a.factCheckData || [],
      generationPrompt: a.generationPrompt
    };

    // --- cas 1 : article publié → accessible à tous, pas besoin d'userId
    if (a.status === 'PUBLISHED') {
      return res.json(responseData);
    }

    // --- cas 2 : brouillon / archivé → réservé à l'auteur (ou admin si tu veux plus tard)
    let viewerId: string | null = null;
    try {
      viewerId = await getCurrentUserId(req, res);
    } catch {
      viewerId = null;
    }

    if (!viewerId || viewerId !== a.authorId) {
      // on “cache” l’existence de l’article
      return res.status(404).json({ error: 'Not Found' });
    }

    // réponse normalisée pour l'auteur
    res.json(responseData);
  } catch (e) {
    next(e);
  }
});
// FIN BLOC




// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
router.get('/search', async (req, res, next) => {
  try {
    // --- petit rate-limit recherche ---
    let key = `ip:${req.ip}`;
    try {
      const user = await getCurrentUser(req, res);
      if (user) {
        key = `user:${user.id}`;
      }
    } catch {
      // on reste sur la clé IP si problème
    }

    // --- petit rate-limit sur la recherche (DB) ---
    // Gère "ip:..." et "user:..."
    await checkAndIncrement(key);

    // --- logique de recherche ---
    const q =
      typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const take = Number.isFinite(Number(req.query.take))
      ? Math.min(Number(req.query.take), 50)
      : 24;
    const cursor =
      typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    const where: Prisma.ArticleWhereInput = {
      AND: [
        { status: 'PUBLISHED' },
        q
          ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { summary: { contains: q, mode: 'insensitive' } },
              { content: { contains: q, mode: 'insensitive' } },
              {
                category: {
                  name: { contains: q, mode: 'insensitive' },
                },
              },
              {
                author: {
                  name: { contains: q, mode: 'insensitive' },
                },
              },
            ],
          }
          : {},
      ],
    };

    const rows = await prisma.article.findMany({
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        content: true,
        imageUrl: true,
        createdAt: true,
        category: {
          select: { id: true, slug: true, name: true },
        },
      },
    });

    const items = rows.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      excerpt: a.summary ?? null,
      content: a.content ?? null,
      imageUrl: a.imageUrl ?? null,
      publishedAt: a.createdAt.toISOString(),
      category: a.category
        ? {
          id: a.category.id,
          slug: a.category.slug,
          name: a.category.name,
        }
        : null,
    }));

    const nextCursor =
      rows.length === take ? rows[rows.length - 1].id : null;
    res.json({ items, nextCursor });
  } catch (err) {
    next(err);
  }
});
// FIN BLOC


// --- GET /api/articles/:id -----------------------------------------------
// DEBUT BLOC (remplace seulement ce handler GET /:id)
router.get('/:id', async (req, res, next) => {
  try {
    // CACHE: 1h si anonyme
    if (!req.cookies?.[COOKIE_NAME]) {
      res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=600');
      res.set('Vary', 'Cookie');
    }

    const { id } = req.params;

    const item = await prisma.article.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        content: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        authorId: true,
        category: { select: { id: true, slug: true, name: true } },
        author: { select: { id: true, email: true, name: true, username: true, avatarUrl: true } },
      },
    });

    if (!item) return res.status(404).json({ error: 'Not Found' });

    // Articles publiés -> OK pour tout le monde
    if (item.status === 'PUBLISHED') {
      return res.json(item);
    }

    // Pour les autres statuts, on vérifie l'auteur (ou admin)
    let allowed = false;
    try {
      const userId = await getCurrentUserId(req, res);
      if (userId && userId === item.authorId) {
        allowed = true;
      } else if (userId) {
        const u = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });
        if (u?.role === 'ADMIN') allowed = true;
      }
    } catch {
      // invité ou erreur → pas allowed
    }

    if (!allowed) {
      // On se contente d'un 404 pour ne pas révéler l'existence du brouillon
      return res.status(404).json({ error: 'Not Found' });
    }

    res.json(item);
  } catch (e) {
    next(e);
  }
});
// FIN BLOC


/** POST /api/articles  */
import { createAIArticle, editAIArticle } from '../controllers/articleController';

// --- POST /api/articles/generate -----------------------------------------
router.post('/generate', createAIArticle);
router.post('/:id/edit-ai', editAIArticle);

// --- POST /api/articles ---------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const {
      title,
      summary,
      content,
      status = 'PUBLISHED',
      imageUrl = null,
      categoryId,

      // 🔥 champs IA (optionnels)
      generationPrompt = null,
      generationConfig = null,
      aiLockedFields = null,
    } = req.body ?? {};

    const limits = ARTICLE_LIMITS;

    // 🔥 récupère l'user connecté
    let currentUserId: string;
    try {
      currentUserId = await getCurrentUserId(req, res);
    } catch {
      return res.status(401).json({ error: 'NO_SESSION' });
    }

    // 0) rate-limit création d’articles (DB)
    await checkAndIncrement(currentUserId);

    // 🔒 BILLING CHECK: Weekly Article Quota (Epion Energy)
    try {
      await checkArticleQuota(currentUserId);
    } catch (error: any) {
      if (error.message === 'WEEKLY_QUOTA_EXCEEDED') {
        return res.status(403).json({
          error: "Quota hebdomadaire d'articles atteint.",
          code: "QUOTA_ARTICLE_EXCEEDED"
        });
      }
      throw error;
    }

    // 1) validations de base
    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return res.status(400).json({
        error: 'article_title_required',
        message: 'Le titre est obligatoire et doit faire au moins 3 caractères.',
      });
    }

    if (title.length > limits.maxTitleChars) {
      return res.status(400).json({
        error: 'article_title_too_long',
        message: `Le titre est trop long (> ${limits.maxTitleChars} caractères).`,
      });
    }

    if (typeof summary === 'string' && summary.length > limits.maxSummaryChars) {
      return res.status(400).json({
        error: 'article_summary_too_long',
        message: `Le chapo est trop long (> ${limits.maxSummaryChars} caractères).`,
      });
    }

    if (typeof content === 'string' && content.length > limits.maxContentChars) {
      return res.status(400).json({
        error: 'article_content_too_long',
        message: `Le contenu est trop long (> ${limits.maxContentChars} caractères).`,
      });
    }

    // 2) quota d’articles par auteur
    const count = await prisma.article.count({
      where: { authorId: currentUserId },
    });
    if (count >= limits.maxArticlesPerUser) {
      return res.status(400).json({
        error: 'article_quota_reached',
        message:
          'Tu as atteint le nombre maximum d’articles pour ton compte. Supprime ou archive des articles avant d’en créer de nouveaux.',
        limit: limits.maxArticlesPerUser,
      });
    }

    const statusValue =
      status === 'PUBLISHED'
        ? 'PUBLISHED'
        : status === 'ARCHIVED'
          ? 'ARCHIVED'
          : 'DRAFT';

    // slug unique (peut partir d'un slug proposé ou du titre)
    const slugBase =
      typeof (req.body as any)?.slug === 'string' && (req.body as any).slug.trim()
        ? (req.body as any).slug.trim()
        : title;

    const finalSlug = await buildUniqueSlug(slugBase);


    // image auto comme avant
    const connectedCat = categoryId
      ? await prisma.category.findUnique({
        where: { id: categoryId },
        select: { slug: true },
      })
      : null;

    const imageFromLib =
      typeof imageUrl === 'string' && imageUrl.trim()
        ? imageUrl.trim()
        : null;

    const safeSummary =
      typeof summary === 'string' ? sanitizeArticleHtml(summary) : null;
    const safeContent =
      typeof content === 'string' ? sanitizeArticleHtml(content) : null;

    const created = await prisma.article.create({
      data: {
        title: sanitizeArticleHtml(title),
        slug: finalSlug,
        summary: safeSummary,
        content: safeContent,
        imageUrl: imageFromLib,
        status: statusValue as any,
        author: { connect: { id: currentUserId } },
        ...(categoryId
          ? { category: { connect: { id: categoryId as string } } }
          : {}),

        generationPrompt:
          typeof generationPrompt === 'string' ? generationPrompt : null,
        generationConfig:
          generationConfig && typeof generationConfig === 'object'
            ? (generationConfig as any)
            : null,
        aiLockedFields:
          Array.isArray(aiLockedFields) ? (aiLockedFields as any) : null,
      },
    });

    // 🧠 RAG: Async Queue (BullMQ)
    // On délègue le travail lourd au worker
    embeddingQueue.add('generate-vector', {
      articleId: created.id,
      // Le content est passé pour info/debug dans le job, mais le worker refetchera la DB pour être sûr
      contentSize: safeContent?.length
    }).catch(err =>
      logger.error('Queue Add Failed', { error: err.message })
    );

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});




// fenêtre de déduplication
const DEDUP_HOURS = 12;

// DEBUT BLOC (remplace le handler /:id/view complet)
router.post('/:id/view', async (req, res, next) => {
  try {
    const articleId = String(req.params.id);

    // 404/204 si l’article n’existe pas ou n'est pas publié
    const exists = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, status: true },
    });
    if (!exists) return res.status(404).json({ error: 'Article not found' });
    if (exists.status !== 'PUBLISHED') {
      // on ne compte pas les vues sur les brouillons/archivés
      return res.status(204).end();
    }

    // qui regarde ?
    let userId: string | null = null;
    try {
      const user = await getCurrentUser(req, res);
      userId = user ? user.id : null;
    } catch {
      userId = null;
    }

    const viewerHash = userId ? null : getViewerHash(req);

    // a-t-on déjà une vue récente pour ce viewer ?
    const since = new Date(Date.now() - DEDUP_HOURS * 3600 * 1000);
    const viewWhere: any = userId
      ? { articleId, userId, createdAt: { gte: since } }
      : { articleId, viewerHash: viewerHash!, createdAt: { gte: since } };

    const already = await prisma.articleView.findFirst({
      where: viewWhere,
      select: { id: true },
    });

    if (!already) {
      await prisma.articleView.create({
        data: { articleId, userId: userId ?? null, viewerHash },
      });

      await prisma.articleStats
        .upsert({
          where: { articleId },
          create: { articleId, viewsAll: 1, lastViewedAt: new Date() },
          update: { viewsAll: { increment: 1 }, lastViewedAt: new Date() },
        })
        .catch(() => { });
    }

    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
// FIN BLOC






router.get('/:id/stats', async (req, res, next) => {
  try {
    const articleId = String(req.params.id);
    const s = await prisma.articleStats.findUnique({ where: { articleId } });
    res.json({
      viewsAll: s?.viewsAll ?? 0,
      views7d: s?.views7d ?? 0,
      views30d: s?.views30d ?? 0,
      savesAll: s?.savesAll ?? 0,
      lastViewedAt: s?.lastViewedAt ?? null,
      trendingScore: s?.trendingScore ?? 0,
    });
  } catch (e) { next(e); }
});

