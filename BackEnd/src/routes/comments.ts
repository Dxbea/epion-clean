// BackEnd/src/routes/comments.ts
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { getCurrentUserId } from '../lib/currentUser.js';
import { ReactionType } from '@prisma/client';
import { checkAndIncrement } from '../lib/rateLimiter.js';
import { sanitizeCommentHtml } from '../lib/sanitizeHtml.js';
import { moderationService } from '../services/moderationService.js';


export const router = Router();

const COMMENT_LIMITS = {
  maxLength: 2000,
  maxPerMinute: 10,
};
// Limites basiques pour les commentaires
const MAX_COMMENTS_PER_USER = 5_000;

// Utilitaire interne pour vérifier qu’un article publié existe
async function ensurePublishedArticle(articleId: string) {
  const a = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true, status: true },
  });
  if (!a || a.status !== 'PUBLISHED') return null;
  return a;
}

/**
 * GET /api/articles/:id/comments?take=20&cursor=COMMENT_ID
 * - renvoie fil à plat (tri asc sur createdAt) + info de base user
 * - les réponses (replies) sont renvoyées dans un second appel si tu veux faire du lazy
 */
router.get('/articles/:id/comments', async (req, res, next) => {
  try {
    const articleId = String(req.params.id);
    const take = Math.min(
      Math.max(parseInt(String(req.query.take ?? '20'), 10) || 20, 1),
      50
    );
    const cursor = req.query.cursor ? String(req.query.cursor) : null;

    // 🔐 contrôles d'accès cohérents avec /api/articles/:id
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, status: true, authorId: true },
    });
    if (!article) {
      return res.status(404).json({ error: 'Not Found' });
    }

    if (article.status !== 'PUBLISHED') {
      try {
        const userId = await getCurrentUserId(req, res);
        if (!userId || userId !== article.authorId) {
          return res.status(404).json({ error: 'Not Found' });
        }
      } catch {
        return res.status(404).json({ error: 'Not Found' });
      }
    }

    const rows = await prisma.comment.findMany({
      where: { articleId, parentId: null },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true } },
        _count: { select: { replies: true } },
      },
    });

    const hasMore = rows.length > take;
    res.json({
      items: rows.slice(0, take).map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        author: c.user
          ? { id: c.user.id, name: c.user.name }
          : null,
        repliesCount: c._count.replies,
      })),
      nextCursor: hasMore ? rows[take - 1].id : null,
    });
  } catch (e) {
    next(e);
  }
});


/** GET /api/comments/:id/replies?take=20&cursor=COMMENT_ID */
router.get('/comments/:id/replies', async (req, res, next) => {
  try {
    const parentId = String(req.params.id);
    const take = Math.min(
      Math.max(parseInt(String(req.query.take ?? '20'), 10) || 20, 1),
      50
    );
    const cursor = req.query.cursor ? String(req.query.cursor) : null;

    // 🔐 récupérer l’article via le parent pour appliquer la même règle
    const parent = await prisma.comment.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        article: { select: { id: true, status: true, authorId: true } },
      },
    });
    if (!parent || !parent.article) {
      return res.status(404).json({ error: 'Not Found' });
    }

    const article = parent.article;
    if (article.status !== 'PUBLISHED') {
      try {
        const userId = await getCurrentUserId(req, res);
        if (!userId || userId !== article.authorId) {
          return res.status(404).json({ error: 'Not Found' });
        }
      } catch {
        return res.status(404).json({ error: 'Not Found' });
      }
    }

    const rows = await prisma.comment.findMany({
      where: { parentId },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true } },
      },
    });

    const hasMore = rows.length > take;
    res.json({
      items: rows.slice(0, take).map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        author: c.user
          ? { id: c.user.id, name: c.user.name }
          : null,
      })),
      nextCursor: hasMore ? rows[take - 1].id : null,
    });
  } catch (e) {
    next(e);
  }
});



// BackEnd/src/routes/comments.ts
// … tout le haut du fichier inchangé …

router.post('/articles/:id/comments', async (req, res, next) => {
  try {
    let userId: string;
    try {
      userId = await getCurrentUserId(req, res);
    } catch {
      return res.status(401).json({ error: 'NO_SESSION' });
    }

    // Vérification email vérifié
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });

    if (!user || !user.emailVerifiedAt) {
      return res.status(403).json({
        error: 'EMAIL_NOT_VERIFIED',
        message:
          'You need to verify your email address before posting comments.',
      });
    }

    const articleId = String(req.params.id);
    const { content, parentId } = req.body || {};

    const raw = String(content ?? '').trim();
    if (!raw) {
      return res.status(400).json({ error: 'Content required' });
    }

    const text = sanitizeCommentHtml(raw);
    if (!text) {
      return res.status(400).json({ error: 'Content required' });
    }

    if (text.length > COMMENT_LIMITS.maxLength) {
      return res.status(400).json({
        error: 'comment_too_long',
        message: `Le commentaire est trop long (> ${COMMENT_LIMITS.maxLength} caractères).`,
      });
    }

    // 🛡️ MODÉRATION IA
    const isSafe = await moderationService.moderateContent(text);
    if (!isSafe) {
      return res.status(400).json({
        error: 'content_moderated',
        message: 'Votre commentaire ne respecte pas nos règles de communauté (détecté par IA).',
      });
    }

    // rate limit par user (DB)
    await checkAndIncrement(userId);

    // quota global de commentaires par compte (volume total)
    const totalComments = await prisma.comment.count({
      where: { userId },
    });
    if (totalComments >= MAX_COMMENTS_PER_USER) {
      return res.status(400).json({
        error: 'comment_quota_reached',
        message:
          'Tu as atteint le nombre maximal de commentaires pour ton compte. Supprime d’anciens commentaires avant d’en publier de nouveaux.',
        limit: MAX_COMMENTS_PER_USER,
      });
    }

    // 404 / contrôle d’accès sur l’article
    const a = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, status: true, authorId: true },
    });
    if (!a) return res.status(404).json({ error: 'Article not found' });

    if (a.status !== 'PUBLISHED' && a.authorId !== userId) {
      // on renvoie 404 pour ne pas révéler l’existence d’un brouillon
      return res.status(404).json({ error: 'Article not found' });
    }

    // parentId optionnel : 404 si parent inconnu ou d’un autre article
    if (parentId) {
      const p = await prisma.comment.findUnique({
        where: { id: String(parentId) },
        select: { id: true, articleId: true },
      });
      if (!p || p.articleId !== articleId) {
        return res.status(404).json({ error: 'Parent comment not found' });
      }
    }

    const c = await prisma.comment.create({
      data: {
        articleId,
        userId,
        content: text,
        parentId: parentId || null,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      author: c.user
        ? { id: c.user.id, name: c.user.name }
        : null,
    });
  } catch (e) {
    next(e);
  }
});



/** DELETE /api/comments/:id  (auteur, auteur de l’article ou admin) */
router.delete('/comments/:id', async (req, res, next) => {
  try {
    let userId: string;
    try {
      userId = await getCurrentUserId(req, res);
    } catch {
      return res.status(401).json({ error: 'NO_SESSION' });
    }

    const id = String(req.params.id);
    const c = await prisma.comment.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        article: { select: { authorId: true } },
      },
    });
    if (!c) return res.status(404).json({ error: 'Comment not found' });

    // auteur du commentaire OU auteur de l’article
    if (c.userId !== userId && c.article.authorId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.comment.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

/** POST /api/articles/:id/react  -> toggle reaction (LIKE/DISLIKE) */
router.post('/articles/:id/react', async (req, res, next) => {
  try {
    let userId: string;
    try {
      userId = await getCurrentUserId(req, res);
    } catch {
      return res.status(401).json({ error: 'NO_SESSION' });
    }
    const articleId = String(req.params.id);
    const { type } = req.body; // 'LIKE' | 'DISLIKE'

    if (!['LIKE', 'DISLIKE'].includes(type)) {
      return res.status(400).json({ error: 'Invalid reaction type' });
    }

    // Rate-limit (DB)
    await checkAndIncrement(userId);

    // 🔐 Check article exists and is published
    const article = await ensurePublishedArticle(articleId);
    if (!article) return res.status(404).json({ error: 'Article not found' });

    // Check existing reaction (any type)
    const existing = await prisma.articleReaction.findFirst({
      where: { userId, articleId },
    });

    // Strategy
    // 1. If exists AND same type -> Delete (Toggle OFF)
    // 2. If exists AND diff type -> Update (Flip)
    // 3. If none -> Create (Toggle ON)

    if (existing) {
      if (existing.type === type) {
        // Case 1: Delete
        await prisma.articleReaction.delete({
          where: { userId_articleId: { userId, articleId } }
        });
      } else {
        // Case 2: Flip
        await prisma.$transaction([
          prisma.articleReaction.delete({ where: { userId_articleId: { userId, articleId } } }),
          prisma.articleReaction.create({ data: { userId, articleId, type } })
        ]);
      }
    } else {
      // Case 3: Create
      await prisma.articleReaction.create({
        data: { userId, articleId, type },
      });
    }

    // Return new counts
    const [likes, dislikes] = await Promise.all([
      prisma.articleReaction.count({ where: { articleId, type: ReactionType.LIKE } }),
      prisma.articleReaction.count({ where: { articleId, type: ReactionType.DISLIKE } }),
    ]);

    // Check what user has now
    const current = await prisma.articleReaction.findFirst({
      where: { userId, articleId },
      select: { type: true }
    });

    res.json({
      success: true,
      likes,
      dislikes,
      userReaction: current?.type || null
    });
  } catch (e) {
    next(e);
  }
});


/** GET /api/articles/:id/reactions -> { likes: number, dislikes: number, userReaction: 'LIKE'|'DISLIKE'|null } */
router.get('/articles/:id/reactions', async (req, res, next) => {
  try {
    const articleId = String(req.params.id);

    // même politique : seulement pour articles publiés
    const a = await ensurePublishedArticle(articleId);
    if (!a) return res.status(404).json({ error: 'Article not found' });

    const [likes, dislikes, reposts, userReaction, userReposted] = await Promise.all([
      prisma.articleReaction.count({ where: { articleId, type: ReactionType.LIKE } }),
      prisma.articleReaction.count({ where: { articleId, type: ReactionType.DISLIKE } }),
      prisma.repost.count({ where: { articleId } }),
      (async () => {
        try {
          const userId = await getCurrentUserId(req, res);
          const r = await prisma.articleReaction.findFirst({
            where: { userId, articleId },
            select: { type: true },
          });
          return r?.type || null;
        } catch {
          return null;
        }
      })(),
      (async () => {
        try {
          const userId = await getCurrentUserId(req, res);
          const r = await prisma.repost.findUnique({
            where: { userId_articleId: { userId, articleId } }
          });
          return !!r;
        } catch {
          return false;
        }
      })(),
    ]);

    res.json({ likes, dislikes, reposts, userReaction, userReposted });
  } catch (e) {
    next(e);
  }
});
