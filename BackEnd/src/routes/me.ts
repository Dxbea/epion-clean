// BackEnd/src/routes/me.ts
import { Router } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { prisma } from '../lib/db.js';
import { getCurrentUser, getCurrentUserId } from '../lib/currentUser.js';
import { checkAndIncrement } from '../lib/rateLimiter.js';
import { logger } from '../lib/logger.js';
import { auth } from '../lib/better-auth.js';
import { deleteStoredProfileImageByUrl, toUploadError, uploadProfileImage } from '../lib/profile-image-storage.js';

export const router = Router();

/**
 * GET /api/me
 * -> profil utilisateur courant
 */
router.get('/', async (req, res, next) => {
  try {
    const user = await getCurrentUser(req, res);
    if (!user) return res.status(401).json({ error: 'NO_SESSION' });

    return res.json({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.name ?? '',
      username: user.username ?? '',
      phone: user.phone ?? '',
      phones: user.phone ?? '',
      avatarUrl: user.avatarUrl ?? null,
      bannerUrl: user.bannerUrl ?? null,
      role: user.role,
      bio: user.bio ?? null,
      followersCount: user.followersCount ?? 0,
      followingCount: user.followingCount ?? 0,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * PUT /api/me
 * -> update profil basique
 */
router.put('/', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res).catch(() => null);
    if (!userId) return res.status(401).json({ error: 'NO_SESSION' });

    // Rate limiting (Maintenant couplé au quota DB)
    await checkAndIncrement(userId);

    const { displayName, username, phone, bio } = req.body ?? {};

    logger.info(`[ME] User ${userId} updating profile`, { displayName, username });

    const dn = String(displayName ?? '').trim();
    const un = String(username ?? '').trim();
    const b = bio ? String(bio).trim() : null;

    if (!dn || dn.length < 2 || dn.length > 80) {
      return res.status(400).json({ error: 'BAD_INPUT', field: 'displayName' });
    }

    const rx = /^[a-z0-9_]{3,20}$/i;
    if (!rx.test(un)) {
      return res.status(400).json({ error: 'BAD_INPUT', field: 'username' });
    }

    // username unique
    const existing = await prisma.user.findFirst({
      where: { username: un, NOT: { id: userId } },
      select: { id: true },
    });
    if (existing) return res.status(409).json({ error: 'USERNAME_TAKEN' });

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        name: dn,
        username: un || null,
        phone: String(phone ?? '').trim() || null,
        bio: b,
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        name: true,
        username: true,
        phone: true,
        avatarUrl: true,
        role: true,
        bio: true,
        followersCount: true,
        followingCount: true,
      },
    });

    logger.info(`[ME] User ${userId} updated successfully`);

    return res.json({
      id: updated.id,
      email: updated.email,
      emailVerified: updated.emailVerified,
      displayName: updated.name ?? '',
      username: updated.username ?? '',
      phone: updated.phone ?? '',
      avatarUrl: updated.avatarUrl ?? null,
      role: updated.role,
      bio: updated.bio ?? null,
      followersCount: updated.followersCount ?? 0,
      followingCount: updated.followingCount ?? 0,
    });
  } catch (e) {
    logger.error(`[ME] Update error`, { userId: (req as any).user?.id, error: (e as any).message });
    next(e);
  }
});

/**
 * GET /api/me/username/available?u=...
 */
router.get('/username/available', async (req, res, next) => {
  try {
    const u = String(req.query.u || '').trim();
    const rx = /^[a-z0-9_]{3,20}$/i;
    if (!rx.test(u)) return res.json({ available: false, reason: 'BAD_INPUT' });

    const clash = await prisma.user.findFirst({ where: { username: u } });
    res.json({ available: !clash });
  } catch (e) {
    next(e);
  }
});

router.get('/sessions', async (req, res, next) => {
  try {
    const user = await getCurrentUser(req, res);
    if (!user) return res.status(401).json({ error: 'NO_SESSION' });

    const sessions = await prisma.betterAuthSession.findMany({
      where: {
        userId: user.id,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      sessions: sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        lastActiveAt: session.updatedAt.toISOString(),
        current: session.id === user.sessionId,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/sessions/others', async (req, res, next) => {
  try {
    const user = await getCurrentUser(req, res);
    if (!user) return res.status(401).json({ error: 'NO_SESSION' });

    const deleted = await prisma.betterAuthSession.count({
      where: {
        userId: user.id,
        id: { not: user.sessionId },
        expiresAt: { gt: new Date() },
      },
    });

    await auth.api.revokeOtherSessions({
      headers: fromNodeHeaders(req.headers),
    });

    return res.json({ ok: true, deleted });
  } catch (error) {
    next(error);
  }
});

router.delete('/sessions/:id', async (req, res, next) => {
  try {
    const user = await getCurrentUser(req, res);
    if (!user) return res.status(401).json({ error: 'NO_SESSION' });

    const target = await prisma.betterAuthSession.findFirst({
      where: {
        id: req.params.id,
        userId: user.id,
      },
      select: {
        id: true,
        token: true,
      },
    });

    if (!target) return res.status(404).json({ error: 'NOT_FOUND' });

    await auth.api.revokeSession({
      headers: fromNodeHeaders(req.headers),
      body: {
        token: target.token,
      },
    });

    return res.json({ ok: true, current: target.id === user.sessionId });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/me/avatar
 * Body: { dataUrl: string }
 */
router.post('/avatar', async (req, res, next) => {
  let uploadedAvatarUrl: string | null = null;

  try {
    const userId = await getCurrentUserId(req, res).catch(() => null);
    if (!userId) return res.status(401).json({ error: 'NO_SESSION' });

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    uploadedAvatarUrl = await uploadProfileImage({
      userId,
      kind: 'avatars',
      dataUrl: String(req.body?.dataUrl || ''),
    });

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: uploadedAvatarUrl },
      select: { id: true, avatarUrl: true },
    });

    await deleteStoredProfileImageByUrl(current?.avatarUrl);

    logger.info(`[ME] Avatar updated`, { userId });

    res.json({ ok: true, avatarUrl: updated.avatarUrl });
  } catch (e) {
    const uploadError = toUploadError(e);
    if (uploadError) return res.status(uploadError.status).json(uploadError.body);
    await deleteStoredProfileImageByUrl(uploadedAvatarUrl);
    next(e);
  }
});

/**
 * POST /api/me/banner
 * Body: { dataUrl: string } (Base64)
 */
router.post('/banner', async (req, res, next) => {
  let uploadedBannerUrl: string | null = null;

  try {
    const userId = await getCurrentUserId(req, res).catch(() => null);
    if (!userId) return res.status(401).json({ error: 'NO_SESSION' });

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { bannerUrl: true },
    });

    uploadedBannerUrl = await uploadProfileImage({
      userId,
      kind: 'banners',
      dataUrl: String(req.body?.dataUrl || ''),
    });

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { bannerUrl: uploadedBannerUrl },
      select: { id: true, bannerUrl: true },
    });

    await deleteStoredProfileImageByUrl(current?.bannerUrl);

    res.json({ ok: true, bannerUrl: updated.bannerUrl });
  } catch (e) {
    const uploadError = toUploadError(e);
    if (uploadError) return res.status(uploadError.status).json(uploadError.body);
    await deleteStoredProfileImageByUrl(uploadedBannerUrl);
    logger.error('[ME] Banner update error', { userId: (req as any).user?.id, error: (e as any).message });
    next(e);
  }
});

/* ------------------------------------------------------------------
   Articles de l'utilisateur courant
   ------------------------------------------------------------------ */

/**
 * GET /api/me/articles/stats
 * -> compte les articles de CE user
 */
router.get('/articles/stats', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res).catch(() => null);
    if (!userId) return res.status(401).json({ error: 'NO_SESSION' });

    // petit rate-limit : stats "mes articles"
    // Rate limiting (DB)
    await checkAndIncrement(userId);

    const [total, draft, published, archived] = await Promise.all([
      prisma.article.count({ where: { authorId: userId } }),
      prisma.article.count({
        where: { authorId: userId, status: 'DRAFT' },
      }),
      prisma.article.count({
        where: { authorId: userId, status: 'PUBLISHED' },
      }),
      prisma.article.count({
        where: { authorId: userId, status: 'ARCHIVED' },
      }),
    ]);

    res.json({ total, draft, published, archived });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/me/articles
 * ?status=ALL|DRAFT|PUBLISHED|ARCHIVED
 * ?q=...
 * ?take=...
 * ?cursor=ARTICLE_ID
 */
router.get('/articles', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res).catch(() => null);
    if (!userId) return res.status(401).json({ error: 'NO_SESSION' });

    // rate-limit léger sur la liste paginée (DB)
    await checkAndIncrement(userId);

    const rawStatus = (req.query.status as string | undefined)?.toUpperCase();
    const ALLOWED = ['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
    const status = ALLOWED.includes(rawStatus as any) ? rawStatus! : 'ALL';

    let q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length > 200) q = q.slice(0, 200);

    const takeRaw = parseInt(String(req.query.take ?? '24'), 10);
    const take = Math.min(Math.max(takeRaw || 24, 1), 50);
    const cursor =
      typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    const where: any = { authorId: userId };

    if (status !== 'ALL') {
      where.status = status;
    }

    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { summary: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await prisma.article.findMany({
      where,
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
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
      },
    });

    const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;

    const items = rows.map((a) => ({
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
    }));

    res.json({ items, nextCursor });
  } catch (e) {
    next(e);
  }
});
