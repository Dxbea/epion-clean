// BackEnd/src/routes/me.ts
import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireSession } from '../lib/session';
import { checkRateLimit } from '../lib/rateLimiter';

export const router = Router();

/**
 * GET /api/me
 * -> profil utilisateur courant
 */
router.get('/', async (req, res, next) => {
  try {
    const sess = await requireSession(req, res);
    if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

    const user = await prisma.user.findUnique({
      where: { id: sess.userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        name: true,
        username: true,
        phone: true,
        avatarUrl: true,
        bannerUrl: true,
        role: true,
        bio: true,
        followersCount: true,
        followingCount: true,
      },
    });
    if (!user) return res.status(401).json({ error: 'INVALID_SESSION' });

    return res.json({
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
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
    const sess = await requireSession(req, res);
    if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

    // Rate limiting: 10 updates per minute per user
    const rl = checkRateLimit(sess.userId, {
      bucket: 'me:update',
      windowMs: 60_000,
      max: 10,
    });

    if (!rl.ok) {
      console.warn(`[RateLimit] User ${sess.userId} exceeded me:update limit.`);
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many profile updates. Please try again later.',
        retryInMs: rl.resetMs,
      });
    }

    const { displayName, username, phone, avatarUrl, bio } = req.body ?? {};

    console.log(`[PUT /api/me] User ${sess.userId} updating profile:`, { displayName, username });

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
      where: { username: un, NOT: { id: sess.userId } },
      select: { id: true },
    });
    if (existing) return res.status(409).json({ error: 'USERNAME_TAKEN' });

    const updated = await prisma.user.update({
      where: { id: sess.userId },
      data: {
        name: dn,
        username: un || null,
        phone: String(phone ?? '').trim() || null,
        avatarUrl: avatarUrl ?? null,
        bio: b,
      },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
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

    console.log(`[PUT /api/me] User ${sess.userId} updated successfully.`); // Success log

    return res.json({
      id: updated.id,
      email: updated.email,
      emailVerifiedAt: updated.emailVerifiedAt,
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
    console.error(`[PUT /api/me] Error:`, e);
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

/**
 * POST /api/me/avatar
 * Body: { dataUrl: string }
 */
router.post('/avatar', async (req, res, next) => {
  try {
    const sess = await requireSession(req, res);
    if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

    const dataUrl = String(req.body?.dataUrl || '');
    if (!dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'BAD_INPUT' });
    }

    // (optionnel) limite de taille simple pour éviter les payloads énormes
    if (dataUrl.length > 2_000_000) {
      return res.status(400).json({ error: 'AVATAR_TOO_LARGE' });
    }

    const updated = await prisma.user.update({
      where: { id: sess.userId },
      data: { avatarUrl: dataUrl },
      select: { id: true, avatarUrl: true },
    });

    res.json({ ok: true, avatarUrl: updated.avatarUrl });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/me/banner
 * Body: { dataUrl: string } (Base64)
 * Save to disk -> public/uploads/banners/
 */
import fs from 'fs';
import path from 'path';

router.post('/banner', async (req, res, next) => {
  try {
    const sess = await requireSession(req, res);
    if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

    const dataUrl = String(req.body?.dataUrl || '');
    if (!dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'BAD_INPUT' });
    }

    // Limit size (approx check on base64 length, 5MB ~ 6.7MB base64)
    if (dataUrl.length > 7_000_000) {
      return res.status(400).json({ error: 'BANNER_TOO_LARGE' });
    }

    // Prepare directory
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'banners');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Extract extension and data
    const matches = dataUrl.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'INVALID_IMAGE_FORMAT' });
    }
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const base64Data = matches[2];

    // Generate filename
    const filename = `${sess.userId}-${Date.now()}.${ext}`;
    const filePath = path.join(uploadDir, filename);

    // Save file
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    // Public URL
    const publicUrl = `/uploads/banners/${filename}`;

    // Update DB
    const updated = await prisma.user.update({
      where: { id: sess.userId },
      data: { bannerUrl: publicUrl },
      select: { id: true, bannerUrl: true },
    });

    res.json({ ok: true, bannerUrl: updated.bannerUrl });
  } catch (e) {
    console.error('[POST /api/me/banner] Error:', e);
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
    const sess = await requireSession(req, res);
    if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

    const userId = sess.userId;

    // petit rate-limit : stats "mes articles"
    const rl = checkRateLimit(userId, {
      bucket: 'me:articles_stats',
      windowMs: 60_000,
      max: 60,
    });
    if (!rl.ok) {
      return res.status(429).json({
        error: 'rate_limit_me_articles_stats',
        message: 'Tu consultes les stats trop vite. Réessaie dans un instant.',
        retryInMs: rl.resetMs,
      });
    }

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
    const sess = await requireSession(req, res);
    if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

    const userId = sess.userId;

    // rate-limit léger sur la liste paginée
    const rl = checkRateLimit(userId, {
      bucket: 'me:articles',
      windowMs: 60_000, // 1 min
      max: 120, // largement suffisant
    });
    if (!rl.ok) {
      return res.status(429).json({
        error: 'rate_limit_me_articles',
        message:
          'Tu charges la liste de tes articles trop souvent. Réessaie dans un instant.',
        retryInMs: rl.resetMs,
      });
    }

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
