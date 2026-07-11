// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import {
  ArticleContributionType,
  ArticleContributionValidationType,
  ArticleStatus,
  Prisma,
} from '@prisma/client';
// import { pickDefaultImage } from '../lib/defaultImages.js';
import { getCurrentUserId, getCurrentUser } from '../lib/currentUser.js';
import { getViewerHash } from '../lib/viewer.js';
import { ARTICLE_LIMITS } from '../config/articleLimits.js';
import { checkAndIncrement } from '../lib/rateLimiter.js';
import { checkArticleQuota } from '../lib/billing-service.js';
import { ingestArticle } from '../lib/rag-service.js';
import { sanitizeArticleHtml } from '../lib/sanitizeHtml.js';
import { logger } from '../lib/logger.js';
import { embeddingQueue } from '../lib/queue.js';
import { hashAnalysisInput, normalizeArticleScorePayload, deriveSourceAnalysisStatus } from '../lib/score-helpers.js';
import { recalculateBridgingScores } from '../services/bridgingService.js';
import { moderationService } from '../services/moderationService.js';
import { enforceContributionRateLimit } from '../lib/contribution-rate-limit.js';


import { getArticleImageProposals } from '../lib/images/proposals.js';

export const router = Router();

const ALLOWED_OPINION_POSITIONS = [-1, -0.6, -0.2, 0.2, 0.6, 1] as const;
const DEFAULT_OPINION_QUESTION = {
  question: 'Les faits présentés relèvent-ils plutôt d’un problème ponctuel ou d’un problème structurel ?',
  thesisA: 'Plutôt ponctuel',
  thesisB: 'Plutôt structurel',
};
const SOURCE_ONLY_TEXT = 'A source has been proposed for readers to examine.';
const PUBLIC_CONTRIBUTION_STATUS = 'ACTIVE';
const NOTE_ELIGIBLE_STATUS = 'ACTIVE';
const REPORT_REASONS = ['SPAM', 'ABUSE', 'OFF_TOPIC', 'MISLEADING_SOURCE', 'PERSONAL_DATA', 'OTHER'] as const;

async function hasAuthenticatedUser(req: Parameters<typeof getCurrentUser>[0], res: Parameters<typeof getCurrentUser>[1]): Promise<boolean> {
  try {
    return Boolean(await getCurrentUser(req, res));
  } catch {
    return false;
  }
}

function isAllowedOpinionPosition(value: unknown): value is number {
  return typeof value === 'number' && ALLOWED_OPINION_POSITIONS.some((position) => position === value);
}

function isContributionType(value: unknown): value is ArticleContributionType {
  return typeof value === 'string' && Object.values(ArticleContributionType).includes(value as ArticleContributionType);
}

function isValidationType(value: unknown): value is ArticleContributionValidationType {
  return typeof value === 'string' && Object.values(ArticleContributionValidationType).includes(value as ArticleContributionValidationType);
}

function isReportReason(value: unknown): value is typeof REPORT_REASONS[number] {
  return typeof value === 'string' && REPORT_REASONS.includes(value as typeof REPORT_REASONS[number]);
}

function normalizeOptionalUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function buildArticleDetailResponse(article: any) {
  const normalizedFactCheckData = normalizeArticleScorePayload(
    article.factCheckData,
    article.factCheckScore ?? null,
    article.factCheckStatus ?? null,
  );
  const rawSources = Array.isArray(normalizedFactCheckData?.sources)
    ? normalizedFactCheckData.sources
    : [];

  const articleStatus = article.factCheckStatus ?? normalizedFactCheckData?.status ?? null;
  const normalizedSources = rawSources.map((source: any) => ({
    ...source,
    analysisStatus: deriveSourceAnalysisStatus(source, articleStatus),
  }));

  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.summary ?? null,
    content: article.content ?? null,
    structuredContent: article.structuredContent ?? null,
    imageUrl: article.imageUrl ?? null,
    status: article.status,
    publishedAt: article.createdAt.toISOString(),
    category: article.category
      ? { id: article.category.id, slug: article.category.slug, name: article.category.name }
      : null,
    author: article.author,
    aiSummary: article.aiSummary ?? null,
    factCheckScore: article.factCheckScore ?? normalizedFactCheckData?.score ?? null,
    factCheckStatus: articleStatus,
    factCheckData: normalizedFactCheckData ?? article.factCheckData ?? null,
    sources: normalizedSources,
    generationPrompt: article.generationPrompt ?? null,
  };
}
async function findPublishedArticleBySlugOrId(slugOrId: string) {
  const exact = await prisma.article.findFirst({
    where: {
      status: 'PUBLISHED',
      OR: [
        { slug: slugOrId },
        { id: slugOrId },
      ],
    },
    select: { id: true, slug: true },
  });
  if (exact) return exact;

  return prisma.article.findFirst({
    where: {
      status: 'PUBLISHED',
      slug: { equals: slugOrId, mode: 'insensitive' },
    },
    select: { id: true, slug: true },
  });
}

async function getUserOpinionPosition(articleId: string, userId: string) {
  return prisma.articleOpinionPosition.findUnique({
    where: { articleId_userId: { articleId, userId } },
    select: { id: true, lacksContext: true },
  });
}

function triggerBridgingRecalculation() {
  void recalculateBridgingScores().catch((error) => {
    logger.warn('Async bridging score recalculation failed', {
      module: 'ArticleInteractions',
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

function validationSummary(validations: Array<{ type: ArticleContributionValidationType }>) {
  return {
    WELL_SOURCED: validations.filter((validation) => validation.type === 'WELL_SOURCED').length,
    ADDS_NUANCE: validations.filter((validation) => validation.type === 'ADDS_NUANCE').length,
    NEEDS_CHECK: validations.filter((validation) => validation.type === 'NEEDS_CHECK').length,
  };
}

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
      select: {
        authorId: true,
        status: true,
        title: true,
        summary: true,
        content: true,
        structuredContent: true,
        factCheckContentHash: true,
        factCheckStatus: true,
        generationPrompt: true,
      },
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

    const sanitizedTitle = title !== undefined ? sanitizeArticleHtml(String(title)) : undefined;
    const sanitizedContent =
      typeof content === 'string'
        ? sanitizeArticleHtml(content)
        : content === null
          ? null
          : undefined;
    const nextStatus =
      status === 'PUBLISHED'
        ? 'PUBLISHED'
        : status === 'ARCHIVED'
          ? 'ARCHIVED'
          : status === 'DRAFT'
            ? 'DRAFT'
            : existing.status;

    const nextContent = sanitizedContent !== undefined ? sanitizedContent : existing.content;
    const generationPending = existing.generationPrompt && ['PENDING', 'RUNNING'].includes(existing.factCheckStatus ?? '');

    if (nextStatus === 'PUBLISHED') {
      if (!nextContent?.trim()) {
        return res.status(400).json({
          error: 'article_content_required',
          message: 'Impossible de publier un article vide.',
        });
      }

      if (generationPending) {
        return res.status(409).json({
          error: 'article_generation_in_progress',
          message: 'La generation de cet article est encore en cours.',
        });
      }
    }

    const data: Prisma.ArticleUpdateInput = {
      ...(sanitizedTitle !== undefined
        ? { title: sanitizedTitle }
        : {}),
      ...(typeof summary === 'string'
        ? { summary: sanitizeArticleHtml(summary) }
        : summary === null
          ? { summary: null }
          : {}),
      ...(sanitizedContent !== undefined ? { content: sanitizedContent } : {}),
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

    const shouldQueueEmbedding =
      nextStatus === 'PUBLISHED' && (
        existing.status !== 'PUBLISHED' ||
        (sanitizedTitle !== undefined && sanitizedTitle !== existing.title) ||
        (sanitizedContent !== undefined && sanitizedContent !== (existing.content ?? null))
      );

    // --- Score invalidation: detect if analyzed content changed ---
    const contentChanged =
      (sanitizedTitle !== undefined && sanitizedTitle !== existing.title) ||
      (typeof summary === 'string' && summary !== (existing.summary ?? '')) ||
      (sanitizedContent !== undefined && sanitizedContent !== (existing.content ?? null));

    if (contentChanged && existing.factCheckStatus === 'COMPLETED' && existing.factCheckContentHash) {
      const newHash = hashAnalysisInput({
        title: sanitizedTitle ?? existing.title,
        summary: typeof summary === 'string' ? summary : existing.summary,
        content: sanitizedContent !== undefined ? sanitizedContent : existing.content,
      });
      if (newHash !== existing.factCheckContentHash) {
        (data as any).factCheckStatus = 'STALE';
      }
    }

    if (contentChanged && sanitizedContent !== undefined) {
      (data as any).structuredContent = Prisma.JsonNull;
    }

    const updated = await prisma.article.update({
      where: { id },
      data,
      select: { id: true, slug: true },
    });

    if (shouldQueueEmbedding) {
      embeddingQueue.add('generate-vector', { articleId: updated.id }).catch(err =>
        logger.error('Queue Add Failed', { error: err.message, articleId: updated.id })
      );
    }

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
    if (!(await hasAuthenticatedUser(req, res))) {
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
    if (!(await hasAuthenticatedUser(req, res))) {
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
        structuredContent: true,
        imageUrl: true,
        status: true,
        createdAt: true,
        category: { select: { id: true, slug: true, name: true } },
        author: { select: { id: true, name: true, username: true, avatarUrl: true } },
      },
    });

    const items = raw.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      excerpt: a.summary ?? null,
      content: a.content ?? null,
      structuredContent: a.structuredContent ?? null,
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

router.get('/:slug/interactions', async (req, res, next) => {
  try {
    const article = await findPublishedArticleBySlugOrId(String(req.params.slug));
    if (!article) return res.status(404).json({ error: 'Article not found' });

    let userId: string | null = null;
    try {
      userId = await getCurrentUserId(req, res);
    } catch {
      userId = null;
    }

    const sortMode = req.query.sort === 'recent' ? 'recent' : 'top';
    const contributionOrderBy = sortMode === 'recent'
      ? [{ createdAt: 'desc' as const }]
      : [{ bridgingScore: 'desc' as const }, { createdAt: 'desc' as const }];

    const [opinionQuestion, currentUserOpinionPosition, contributions, opinionPositions] = await Promise.all([
      prisma.articleOpinionQuestion.upsert({
        where: { articleId: article.id },
        create: {
          articleId: article.id,
          ...DEFAULT_OPINION_QUESTION,
        },
        update: {},
        select: {
          id: true,
          articleId: true,
          question: true,
          thesisA: true,
          thesisB: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      userId
        ? prisma.articleOpinionPosition.findUnique({
          where: { articleId_userId: { articleId: article.id, userId } },
          select: {
            id: true,
            selectedPosition: true,
            lacksContext: true,
            confirmedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        })
        : Promise.resolve(null),
      (prisma as any).articleContribution.findMany({
        where: { articleId: article.id, targetContributionId: null, status: PUBLIC_CONTRIBUTION_STATUS } as any,
        orderBy: contributionOrderBy,
        take: 50,
        select: {
          id: true,
          targetContributionId: true,
          status: true,
          type: true,
          text: true,
          sourceUrl: true,
          bridgingScore: true,
          editedAt: true,
          editCount: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, username: true, avatarUrl: true } },
          validations: {
            select: {
              type: true,
              userId: true,
            },
          },
          children: {
            where: { status: NOTE_ELIGIBLE_STATUS } as any,
            orderBy: [{ bridgingScore: 'desc' as const }, { createdAt: 'desc' as const }],
            select: {
              id: true,
              targetContributionId: true,
              status: true,
              type: true,
              text: true,
              sourceUrl: true,
              bridgingScore: true,
              editedAt: true,
              editCount: true,
              createdAt: true,
              updatedAt: true,
              user: { select: { id: true, name: true, username: true, avatarUrl: true } },
              validations: {
                select: {
                  type: true,
                  userId: true,
                },
              },
            },
          },
        },
      }),
      prisma.articleOpinionPosition.findMany({
        where: { articleId: article.id },
        select: {
          selectedPosition: true,
          lacksContext: true,
        },
      }),
    ]);

    const hasInsufficientContext = currentUserOpinionPosition?.lacksContext === true;
    const positionCounts = Object.fromEntries(
      ALLOWED_OPINION_POSITIONS.map((position) => [String(position), 0]),
    ) as Record<string, number>;
    let lacksContextCount = 0;

    for (const position of opinionPositions) {
      if (position.lacksContext) {
        lacksContextCount++;
        continue;
      }
      if (position.selectedPosition !== null && isAllowedOpinionPosition(position.selectedPosition)) {
        positionCounts[String(position.selectedPosition)] += 1;
      }
    }
    const totalPositionCount = Object.values(positionCounts).reduce((sum, count) => sum + count, 0);
    const serializeContribution = (contribution: any, children = contribution.children || []) => ({
      id: contribution.id,
      targetContributionId: contribution.targetContributionId,
      status: contribution.status,
      type: contribution.type,
      text: contribution.text,
      sourceUrl: contribution.sourceUrl,
      bridgingScore: contribution.bridgingScore,
      editedAt: contribution.editedAt?.toISOString() ?? null,
      editCount: contribution.editCount,
      createdAt: contribution.createdAt.toISOString(),
      updatedAt: contribution.updatedAt.toISOString(),
      author: contribution.user
        ? {
          id: contribution.user.id,
          name: contribution.user.name,
          username: contribution.user.username,
          avatarUrl: contribution.user.avatarUrl,
        }
        : null,
      validationSummary: validationSummary(contribution.validations),
      currentUserValidations: userId
        ? contribution.validations
          .filter((validation: { userId: string }) => validation.userId === userId)
          .map((validation: { type: ArticleContributionValidationType }) => validation.type)
        : [],
      children: children.map((child: any) => ({
        id: child.id,
        targetContributionId: child.targetContributionId,
        status: child.status,
        type: child.type,
        text: child.text,
        sourceUrl: child.sourceUrl,
        bridgingScore: child.bridgingScore,
        editedAt: child.editedAt?.toISOString() ?? null,
        editCount: child.editCount,
        createdAt: child.createdAt.toISOString(),
        updatedAt: child.updatedAt.toISOString(),
        author: child.user
          ? {
            id: child.user.id,
            name: child.user.name,
            username: child.user.username,
            avatarUrl: child.user.avatarUrl,
          }
          : null,
        validationSummary: validationSummary(child.validations),
        currentUserValidations: userId
          ? child.validations
            .filter((validation: { userId: string }) => validation.userId === userId)
            .map((validation: { type: ArticleContributionValidationType }) => validation.type)
          : [],
        children: [],
      })),
    });

    res.json({
      sortMode,
      opinionQuestion: {
        ...opinionQuestion,
        createdAt: opinionQuestion.createdAt.toISOString(),
        updatedAt: opinionQuestion.updatedAt.toISOString(),
      },
      allowedPositions: ALLOWED_OPINION_POSITIONS,
      currentUserOpinionPosition: currentUserOpinionPosition
        ? {
          ...currentUserOpinionPosition,
          confirmedAt: currentUserOpinionPosition.confirmedAt.toISOString(),
          createdAt: currentUserOpinionPosition.createdAt.toISOString(),
          updatedAt: currentUserOpinionPosition.updatedAt.toISOString(),
        }
        : null,
      hasInsufficientContext,
      canContribute: !!currentUserOpinionPosition && !hasInsufficientContext,
      canValidateContributions: !!currentUserOpinionPosition && !hasInsufficientContext,
      opinionDistribution: {
        counts: positionCounts,
        total: totalPositionCount,
        lacksContextCount,
      },
      contributions: contributions.map((contribution: any) => serializeContribution(contribution)),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/:slug/opinion-position', async (req, res, next) => {
  try {
    let userId: string;
    try {
      userId = await getCurrentUserId(req, res);
    } catch {
      return res.status(401).json({ error: 'NO_SESSION' });
    }
    const article = await findPublishedArticleBySlugOrId(String(req.params.slug));
    if (!article) return res.status(404).json({ error: 'Article not found' });

    const selectedPosition = req.body?.selectedPosition;
    const lacksContext = req.body?.lacksContext;

    if (typeof lacksContext !== 'boolean') {
      return res.status(400).json({ error: 'invalid_lacks_context' });
    }

    const hasSelectedPosition = selectedPosition !== undefined && selectedPosition !== null;
    if (hasSelectedPosition && lacksContext) {
      return res.status(400).json({ error: 'opinion_position_mutually_exclusive' });
    }
    if (!hasSelectedPosition && !lacksContext) {
      return res.status(400).json({ error: 'opinion_position_required' });
    }
    if (hasSelectedPosition && !isAllowedOpinionPosition(selectedPosition)) {
      return res.status(400).json({ error: 'invalid_opinion_position' });
    }

    const existing = await prisma.articleOpinionPosition.findUnique({
      where: { articleId_userId: { articleId: article.id, userId } },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({ error: 'opinion_position_already_confirmed' });
    }

    const created = await prisma.articleOpinionPosition.create({
      data: {
        articleId: article.id,
        userId,
        selectedPosition: hasSelectedPosition ? selectedPosition : null,
        lacksContext,
        confirmedAt: new Date(),
      },
      select: {
        id: true,
        selectedPosition: true,
        lacksContext: true,
        confirmedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json({
      ...created,
      confirmedAt: created.confirmedAt.toISOString(),
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      hasInsufficientContext: created.lacksContext,
      canContribute: !created.lacksContext,
      canValidateContributions: !created.lacksContext,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/:slug/contributions', async (req, res, next) => {
  try {
    let userId: string;
    try {
      userId = await getCurrentUserId(req, res);
    } catch {
      return res.status(401).json({ error: 'NO_SESSION' });
    }
    await enforceContributionRateLimit(req, userId, 'create');

    const article = await findPublishedArticleBySlugOrId(String(req.params.slug));
    if (!article) return res.status(404).json({ error: 'Article not found' });

    const userOpinionPosition = await getUserOpinionPosition(article.id, userId);
    if (!userOpinionPosition) {
      return res.status(403).json({ error: 'opinion_position_required' });
    }

    if (userOpinionPosition.lacksContext) {
      return res.status(409).json({ error: 'insufficient_context_confirmed' });
    }

    const { type } = req.body ?? {};
    if (!isContributionType(type)) {
      return res.status(400).json({ error: 'invalid_contribution_type' });
    }

    const rawTargetContributionId = typeof req.body?.targetContributionId === 'string'
      ? req.body.targetContributionId.trim()
      : '';
    const targetContributionId = rawTargetContributionId || null;
    const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const sourceUrl = normalizeOptionalUrl(req.body?.sourceUrl);

    if (targetContributionId) {
      const targetContribution = await (prisma as any).articleContribution.findFirst({
        where: {
          id: targetContributionId,
          articleId: article.id,
          targetContributionId: null,
          status: PUBLIC_CONTRIBUTION_STATUS,
        },
        select: { id: true },
      });
      if (!targetContribution) {
        return res.status(404).json({ error: 'target_contribution_not_found' });
      }
    }

    if (req.body?.sourceUrl && !sourceUrl) {
      return res.status(400).json({ error: 'invalid_source_url' });
    }
    if ((type === ArticleContributionType.SOURCE || targetContributionId) && !sourceUrl) {
      return res.status(400).json({ error: 'source_url_required' });
    }
    if ((type !== ArticleContributionType.SOURCE || targetContributionId) && !rawText) {
      return res.status(400).json({ error: 'contribution_text_required' });
    }

    const text = sanitizeArticleHtml(rawText || SOURCE_ONLY_TEXT).trim();
    if (!text) {
      return res.status(400).json({ error: 'contribution_text_required' });
    }
    if (text.length > 5000) {
      return res.status(400).json({ error: 'contribution_text_too_long' });
    }
    const isSafe = await moderationService.moderateContent(text);
    if (!isSafe) {
      return res.status(400).json({ error: 'contribution_moderation_failed' });
    }

    const created = await (prisma as any).articleContribution.create({
      data: {
        articleId: article.id,
        userId,
        targetContributionId,
        status: PUBLIC_CONTRIBUTION_STATUS,
        type,
        text,
        sourceUrl,
      } as any,
      select: {
        id: true,
        targetContributionId: true,
        status: true,
        type: true,
        text: true,
        sourceUrl: true,
        bridgingScore: true,
        editedAt: true,
        editCount: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, username: true, avatarUrl: true } },
      },
    });

    res.status(201).json({
      id: created.id,
      targetContributionId: created.targetContributionId,
      status: created.status,
      type: created.type,
      text: created.text,
      sourceUrl: created.sourceUrl,
      bridgingScore: created.bridgingScore,
      editedAt: created.editedAt?.toISOString() ?? null,
      editCount: created.editCount,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      author: created.user
        ? {
          id: created.user.id,
          name: created.user.name,
          username: created.user.username,
          avatarUrl: created.user.avatarUrl,
        }
        : null,
      validationSummary: {
        WELL_SOURCED: 0,
        ADDS_NUANCE: 0,
        NEEDS_CHECK: 0,
      },
      currentUserValidations: [],
      children: [],
    });
  } catch (e) {
    next(e);
  }
});

router.post('/contributions/:contributionId/validations', async (req, res, next) => {
  try {
    let userId: string;
    try {
      userId = await getCurrentUserId(req, res);
    } catch {
      return res.status(401).json({ error: 'NO_SESSION' });
    }
    await enforceContributionRateLimit(req, userId, 'validate');

    const contributionId = String(req.params.contributionId);
    const { type } = req.body ?? {};
    if (!isValidationType(type)) {
      return res.status(400).json({ error: 'invalid_validation_type' });
    }

    const contribution = await (prisma as any).articleContribution.findUnique({
      where: { id: contributionId },
      select: {
        id: true,
        userId: true,
        articleId: true,
        status: true,
        article: { select: { status: true } },
      },
    });
    if (!contribution || contribution.article.status !== 'PUBLISHED' || contribution.status !== PUBLIC_CONTRIBUTION_STATUS) {
      return res.status(404).json({ error: 'Contribution not found' });
    }

    if (contribution.userId === userId) {
      return res.status(403).json({ error: 'cannot_validate_own_contribution' });
    }

    const userOpinionPosition = await getUserOpinionPosition(contribution.articleId, userId);
    if (!userOpinionPosition) {
      return res.status(403).json({ error: 'opinion_position_required' });
    }

    if (userOpinionPosition.lacksContext) {
      return res.status(409).json({ error: 'insufficient_context_confirmed' });
    }

    const existing = await prisma.articleContributionValidation.findUnique({
      where: { contributionId_userId_type: { contributionId, userId, type } },
      select: { id: true },
    });

    if (existing) {
      await prisma.articleContributionValidation.delete({ where: { id: existing.id } });
      await (prisma as any).articleContribution.update({
        where: { id: contributionId },
        data: { needsRecalc: true },
      });
      triggerBridgingRecalculation();

      const validations = await prisma.articleContributionValidation.findMany({
        where: { contributionId },
        select: { type: true },
      });

      return res.status(200).json({
        action: 'REMOVED',
        type,
        validationSummary: validationSummary(validations),
      });
    }

    const created = await prisma.articleContributionValidation.create({
      data: { contributionId, userId, type },
      select: { id: true, type: true, createdAt: true },
    });
    await (prisma as any).articleContribution.update({
      where: { id: contributionId },
      data: { needsRecalc: true },
    });
    triggerBridgingRecalculation();

    const validations = await prisma.articleContributionValidation.findMany({
      where: { contributionId },
      select: { type: true },
    });

    return res.status(201).json({
      action: 'ADDED',
      id: created.id,
      type: created.type,
      createdAt: created.createdAt.toISOString(),
      validationSummary: validationSummary(validations),
    });
  } catch (e) {
    next(e);
  }
});

router.patch('/contributions/:contributionId', async (req, res, next) => {
  try {
    const user = await getCurrentUser(req, res);
    if (!user) return res.status(401).json({ error: 'NO_SESSION' });
    await enforceContributionRateLimit(req, user.id, 'moderate');

    const contributionId = String(req.params.contributionId);
    const contribution = await (prisma as any).articleContribution.findUnique({
      where: { id: contributionId },
      select: {
        id: true,
        userId: true,
        targetContributionId: true,
        type: true,
        status: true,
        article: { select: { status: true } },
      } as any,
    } as any);

    if (!contribution || contribution.article.status !== 'PUBLISHED' || contribution.status !== PUBLIC_CONTRIBUTION_STATUS) {
      return res.status(404).json({ error: 'Contribution not found' });
    }
    if (contribution.userId !== user.id && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const sourceUrl = normalizeOptionalUrl(req.body?.sourceUrl);

    if (req.body?.sourceUrl && !sourceUrl) {
      return res.status(400).json({ error: 'invalid_source_url' });
    }
    if ((contribution.type === ArticleContributionType.SOURCE || contribution.targetContributionId) && !sourceUrl) {
      return res.status(400).json({ error: 'source_url_required' });
    }
    if ((contribution.type !== ArticleContributionType.SOURCE || contribution.targetContributionId) && !rawText) {
      return res.status(400).json({ error: 'contribution_text_required' });
    }

    const text = sanitizeArticleHtml(rawText || SOURCE_ONLY_TEXT).trim();
    if (!text) return res.status(400).json({ error: 'contribution_text_required' });
    if (text.length > 5000) return res.status(400).json({ error: 'contribution_text_too_long' });

    const isSafe = await moderationService.moderateContent(text);
    if (!isSafe) {
      return res.status(400).json({ error: 'contribution_moderation_failed' });
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.articleContributionValidation.deleteMany({ where: { contributionId } }),
      (prisma as any).articleContribution.update({
        where: { id: contributionId },
        data: {
          text,
          sourceUrl,
          bridgingScore: 0,
          needsRecalc: false,
          editedAt: now,
          editCount: { increment: 1 },
        } as any,
      } as any),
      ...(contribution.targetContributionId
        ? []
        : [
          (prisma as any).articleContribution.updateMany({
            where: { targetContributionId: contributionId, status: PUBLIC_CONTRIBUTION_STATUS } as any,
            data: { status: 'STALE' } as any,
          } as any),
        ]),
    ]);

    const updated = await (prisma as any).articleContribution.findUnique({
      where: { id: contributionId },
      select: {
        id: true,
        targetContributionId: true,
        status: true,
        type: true,
        text: true,
        sourceUrl: true,
        bridgingScore: true,
        editedAt: true,
        editCount: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, username: true, avatarUrl: true } },
      } as any,
    } as any);

    if (!updated) {
      return res.status(404).json({ error: 'Contribution not found' });
    }

    return res.json({
      id: updated.id,
      targetContributionId: updated.targetContributionId,
      status: updated.status,
      type: updated.type,
      text: updated.text,
      sourceUrl: updated.sourceUrl,
      bridgingScore: updated.bridgingScore,
      editedAt: updated.editedAt?.toISOString() ?? null,
      editCount: updated.editCount,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      author: updated.user,
      validationSummary: { WELL_SOURCED: 0, ADDS_NUANCE: 0, NEEDS_CHECK: 0 },
      currentUserValidations: [],
      children: [],
    });
  } catch (e) {
    next(e);
  }
});

router.delete('/contributions/:contributionId', async (req, res, next) => {
  try {
    const user = await getCurrentUser(req, res);
    if (!user) return res.status(401).json({ error: 'NO_SESSION' });
    await enforceContributionRateLimit(req, user.id, 'moderate');

    const contributionId = String(req.params.contributionId);
    const contribution = await (prisma as any).articleContribution.findUnique({
      where: { id: contributionId },
      select: {
        id: true,
        userId: true,
        status: true,
        article: { select: { status: true } },
      } as any,
    } as any);

    if (!contribution || contribution.article.status !== 'PUBLISHED' || contribution.status !== PUBLIC_CONTRIBUTION_STATUS) {
      return res.status(404).json({ error: 'Contribution not found' });
    }
    if (contribution.userId !== user.id && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    await (prisma as any).articleContribution.update({
      where: { id: contributionId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        bridgingScore: 0,
        needsRecalc: false,
      } as any,
    } as any);

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/contributions/:contributionId/reports', async (req, res, next) => {
  try {
    let userId: string;
    try {
      userId = await getCurrentUserId(req, res);
    } catch {
      return res.status(401).json({ error: 'NO_SESSION' });
    }
    await enforceContributionRateLimit(req, userId, 'report');

    const contributionId = String(req.params.contributionId);
    const reason = req.body?.reason;
    if (!isReportReason(reason)) {
      return res.status(400).json({ error: 'invalid_report_reason' });
    }

    const details = typeof req.body?.details === 'string'
      ? sanitizeArticleHtml(req.body.details.trim()).slice(0, 1000)
      : null;

    const contribution = await (prisma as any).articleContribution.findUnique({
      where: { id: contributionId },
      select: { id: true, userId: true, status: true, article: { select: { status: true } } } as any,
    } as any);

    if (!contribution || contribution.article.status !== 'PUBLISHED' || contribution.status !== PUBLIC_CONTRIBUTION_STATUS) {
      return res.status(404).json({ error: 'Contribution not found' });
    }
    if (contribution.userId === userId) {
      return res.status(403).json({ error: 'cannot_report_own_contribution' });
    }

    const report = await (prisma as any).articleContributionReport.upsert({
      where: {
        contributionId_reporterId_reason: {
          contributionId,
          reporterId: userId,
          reason,
        },
      },
      create: {
        contributionId,
        reporterId: userId,
        reason,
        details,
      },
      update: {
        details,
        status: 'PENDING',
        reviewedAt: null,
        reviewedById: null,
      },
      select: {
        id: true,
        status: true,
        reason: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info('Article contribution reported', {
      module: 'ArticleInteractions',
      contributionId,
      reporterId: userId,
      reason,
    });

    return res.status(201).json({
      id: report.id,
      status: report.status,
      reason: report.reason,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    });
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

    if (!(await hasAuthenticatedUser(req, res))) {
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
        structuredContent: true,
        imageUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        authorId: true,
        category: { select: { id: true, slug: true, name: true } },
        author: { select: { id: true, name: true, username: true, avatarUrl: true } },
        // AI Fields
        aiSummary: true,
        factCheckScore: true,
        factCheckData: true,
        factCheckStatus: true,
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
          structuredContent: true,
          imageUrl: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          authorId: true,
          category: { select: { id: true, slug: true, name: true } },
          author: { select: { id: true, name: true, username: true, avatarUrl: true } },
          // AI Fields
          aiSummary: true,
          factCheckScore: true,
          factCheckData: true,
          factCheckStatus: true,
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
          structuredContent: true,
          imageUrl: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          authorId: true,
          category: { select: { id: true, slug: true, name: true } },
          author: { select: { id: true, name: true, username: true, avatarUrl: true } },
          // AI Fields
          aiSummary: true,
          factCheckScore: true,
          factCheckData: true,
          factCheckStatus: true,
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

    const responseData = buildArticleDetailResponse(a);

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
        structuredContent: true,
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
      structuredContent: a.structuredContent ?? null,
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


// --- GET /api/articles/:id/status -----------------------------------------
router.get('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;

    const article = await prisma.article.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        status: true,
        authorId: true,
        factCheckStatus: true,
        factCheckError: true,
        factCheckStartedAt: true,
        factCheckCompletedAt: true,
        generationPrompt: true,
        content: true,
        updatedAt: true,
      },
    });

    if (!article) return res.status(404).json({ error: 'Not Found' });

    let allowed = article.status === 'PUBLISHED';
    if (!allowed) {
      try {
        const userId = await getCurrentUserId(req, res);
        if (userId === article.authorId) {
          allowed = true;
        } else if (userId) {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
          });
          allowed = user?.role === 'ADMIN';
        }
      } catch {
        allowed = false;
      }
    }

    if (!allowed) return res.status(404).json({ error: 'Not Found' });

    const generationStatus = article.factCheckStatus ?? 'PENDING';
    return res.json({
      id: article.id,
      articleId: article.id,
      slug: article.slug,
      status: article.status,
      generationStatus,
      factCheckStatus: article.factCheckStatus,
      factCheckError: article.factCheckError ?? null,
      error: article.factCheckError ?? null,
      updatedAt: article.updatedAt.toISOString(),
      contentReady: Boolean(article.content?.trim()),
      startedAt: article.factCheckStartedAt ? article.factCheckStartedAt.toISOString() : null,
      completedAt: article.factCheckCompletedAt ? article.factCheckCompletedAt.toISOString() : null,
    });
  } catch (e) {
    next(e);
  }
});
// --- GET /api/articles/:id -----------------------------------------------
// DEBUT BLOC (remplace seulement ce handler GET /:id)
router.get('/:id', async (req, res, next) => {
  try {
    // CACHE: 1h si anonyme
    if (!(await hasAuthenticatedUser(req, res))) {
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
        structuredContent: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        authorId: true,
        category: { select: { id: true, slug: true, name: true } },
        author: { select: { id: true, name: true, username: true, avatarUrl: true } },
        // AI Fields
        aiSummary: true,
        factCheckScore: true,
        factCheckData: true,
        factCheckStatus: true,
        generationPrompt: true,
      },
    });

    if (!item) return res.status(404).json({ error: 'Not Found' });

    // Articles publiés -> OK pour tout le monde
    if (item.status === 'PUBLISHED') {
      return res.json(buildArticleDetailResponse(item));
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

    res.json(buildArticleDetailResponse(item));
  } catch (e) {
    next(e);
  }
});
// FIN BLOC


/** POST /api/articles  */
import { createAIArticle, editAIArticle } from '../controllers/articleController.js';

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

    if (statusValue === 'PUBLISHED') {
      embeddingQueue.add('generate-vector', {
        articleId: created.id,
        // Le content est passé pour info/debug dans le job, mais le worker refetchera la DB pour être sûr
        contentSize: safeContent?.length
      }).catch(err =>
        logger.error('Queue Add Failed', { error: err.message, articleId: created.id })
      );
    }

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
