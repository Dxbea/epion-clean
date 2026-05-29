// BackEnd/src/routes/auth.ts
// TS-Server-Refresh
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '../lib/db';
import { loginLimiter, forgotLimiter } from '../middleware/limits';
import {
  createJwtForSession,
  requireSession,
  setSessionCookie,
  clearSessionCookie,
  invalidateSessionCache,
  invalidateUserSessionCaches,
} from '../lib/session';
import { env } from '../env';
import { sendMail, APP_URL } from '../lib/mailer';
import { getCurrentUserId } from '../lib/currentUser';
import { logger } from '../lib/logger';



const router = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  inviteCode: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const changePwdSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// petit helper “mot de passe fort” (tu peux l’assouplir)
function serverStrongPassword(pw: string): boolean {
  return (
    pw.length >= 8 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^\w\s]/.test(pw)
  );
}

const BETA_MODE = process.env.NODE_ENV !== 'test' && process.env.BETA_MODE === 'true';

/* ------------------------ VERIFY INVITE CODE ------------------------ */
router.post('/auth/verify-invite', async (req, res, next) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'MISSING_CODE' });

    const invite = await prisma.inviteCode.findUnique({ where: { code } });

    if (!invite) {
      return res.status(400).json({ error: 'INVALID_CODE' });
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(400).json({ error: 'EXPIRED_CODE' });
    }

    if (invite.usedCount >= invite.maxUses) {
      return res.status(400).json({ error: 'CODE_FULL' });
    }

    return res.json({ valid: true });
  } catch (e) {
    next(e);
  }
});

/* ------------------------ SIGNUP ------------------------ */
router.post('/auth/signup', async (req, res, next) => {
  try {
    const input = signupSchema.parse(req.body);
    const email = input.email.toLowerCase().trim();

    if (!serverStrongPassword(input.password)) {
      return res.status(400).json({ error: 'WEAK_PASSWORD' });
    }

    // Beta mode: require invite code
    let inviteCodeId: string | undefined;
    if (BETA_MODE) {
      const code = String(input.inviteCode || '').trim().toUpperCase();
      if (!code) return res.status(400).json({ error: 'MISSING_INVITE_CODE' });

      const invite = await prisma.inviteCode.findUnique({ where: { code } });
      if (!invite) return res.status(400).json({ error: 'INVALID_INVITE_CODE' });
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        return res.status(400).json({ error: 'EXPIRED_INVITE_CODE' });
      }
      if (invite.usedCount >= invite.maxUses) {
        return res.status(400).json({ error: 'INVITE_CODE_FULL' });
      }
      inviteCodeId = invite.id;
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'EMAIL_EXISTS' });

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email,
        name: input.displayName,
        role: 'USER',
        passwordHash,
        ...(inviteCodeId ? { inviteCodeId } : {}),
      },
      select: { id: true, email: true, name: true },
    });

    // Increment invite code usage
    if (inviteCodeId) {
      await prisma.inviteCode.update({
        where: { id: inviteCodeId },
        data: { usedCount: { increment: 1 } },
      });
    }

    // 👉 crée la session DB (7 jours, aligné sur le JWT)
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: { userId: user.id, expiresAt: sessionExpiresAt },
      select: { id: true },
    });

    // 👉 JWT + cookie
    const token = createJwtForSession(user.id, session.id);
    setSessionCookie(res, token);

    res.status(201).json({ user });
  } catch (e) {
    next(e);
  }
});

// GET /api/auth/beta-status — tells the frontend if beta mode is on
router.get('/auth/beta-status', (_req, res) => {
  res.json({ betaMode: BETA_MODE });
});

// ---------- login ----------
router.post('/auth/login', loginLimiter, async (req, res, next) => {
  try {
    // 1️⃣ Validation de l'input
    const input = loginSchema.parse(req.body);
    const email = input.email.toLowerCase().trim();

    // 2️⃣ Recherche du user
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

    }

    // 3️⃣ Vérification du mot de passe
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      logger.warn(`[AUTH] Failed login attempt`, { email });
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }
    logger.info(`[AUTH] Login success`, { userId: user.id });


    // 4️⃣ Création de la session DB (7 jours, aligné sur le JWT)
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: { userId: user.id, expiresAt: sessionExpiresAt },
      select: { id: true },
    });

    // 5️⃣ Création du token JWT via helper commun
    const token = createJwtForSession(user.id, session.id);

    // 6️⃣ Pose du cookie de session sécurisé
    setSessionCookie(res, token);

    // 7️⃣ Réponse JSON
    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (e) {
    next(e);
  }
});
// 🔁 Demander (ou redemander) un email de vérification
// POST /api/auth/request-verify  { email }
router.post('/auth/request-verify', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'invalid_email' });
    }

    // Ne pas révéler si le compte existe → on répond pareil dans tous les cas
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      // On fait comme si tout allait bien
      return res.status(204).end();
    }

    // Nettoyer d’anciens tokens
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 h

    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    const verifyUrl = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;


    await sendMail({
      to: user.email,
      subject: 'Verify your email for Epion',
      text: `Click this link to verify your email:\n\n${verifyUrl}`,
      html: `<p>Click this link to verify your email:</p>
             <p><a href="${verifyUrl}">${verifyUrl}</a></p>
             <p>This link is valid for 24 hours.</p>`,
    });

    return res.status(204).end();
  } catch (e) {
    next(e);
  }
});



/* ------------------------ LOGOUT ------------------------ */
router.post('/auth/logout', async (req, res) => {
  const sess = await requireSession(req, res);
  if (sess) {
    await prisma.session.delete({ where: { id: sess.sessionId } }).catch(() => { });
    await invalidateSessionCache(sess.sessionId);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

/* ------------------------ ME ------------------------ */
router.get('/auth/me', async (req, res) => {
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

  res.set('Cache-Control', 'no-store');
  res.json({
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    displayName: user.name ?? '',
    username: user.username ?? '',
    phone: user.phone ?? '',
    avatarUrl: user.avatarUrl ?? null,
    bannerUrl: user.bannerUrl ?? null,
    role: user.role,
    bio: user.bio ?? null,
    followersCount: user.followersCount ?? 0,
    followingCount: user.followingCount ?? 0,
  });
});

/* ------------------------ FORGOT / RESET ------------------------ */
router.post('/auth/forgot-password', forgotLimiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'BAD_INPUT' });

    const user = await prisma.user.findUnique({ where: { email } });
    // réponse neutre
    if (!user) return res.json({ ok: true });

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

    await prisma.passwordReset.create({ data: { userId: user.id, token, expiresAt } });

    const resetUrl = `${process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'}/settings#security?resetToken=${token}`;
    await sendMail({
      to: user.email,
      subject: 'Reset your password for Epion',
      text: `Click this link to reset your password:\n\n${resetUrl}\n\nThis link is valid for 30 minutes.`,
      html: `<p>Click this link to reset your password:</p>
             <p><a href="${resetUrl}">${resetUrl}</a></p>
             <p>This link is valid for 30 minutes.</p>`,
    });

    // Réponse neutre — le token est UNIQUEMENT envoyé par email
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/auth/reset-password', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!token || newPassword.length < 8) return res.status(400).json({ error: 'BAD_INPUT' });

    const pr = await prisma.passwordReset.findUnique({ where: { token } });
    if (!pr || pr.usedAt || pr.expiresAt < new Date()) {
      return res.status(400).json({ error: 'INVALID_OR_EXPIRED' });
    }

    const newHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
    await invalidateUserSessionCaches(pr.userId);
    await prisma.$transaction([
      prisma.user.update({ where: { id: pr.userId }, data: { passwordHash: newHash } }),
      prisma.passwordReset.update({ where: { token }, data: { usedAt: new Date() } }),
      prisma.session.deleteMany({ where: { userId: pr.userId } }),
    ]);

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ------------------------ CHANGE PASSWORD ------------------------ */
router.post('/auth/change-password', async (req, res) => {
  const sess = await requireSession(req, res);
  if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

  const parsed = changePwdSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_INPUT' });

  const user = await prisma.user.findUnique({ where: { id: sess.userId } });
  if (!user || !user.passwordHash) return res.status(401).json({ error: 'INVALID_SESSION' });

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'WRONG_PASSWORD' });

  const newHash = await bcrypt.hash(parsed.data.newPassword, env.BCRYPT_ROUNDS);
  const otherSessions = await prisma.session.findMany({
    where: { userId: sess.userId, NOT: { id: sess.sessionId } },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.user.update({ where: { id: sess.userId }, data: { passwordHash: newHash } }),
    prisma.session.deleteMany({ where: { userId: sess.userId, NOT: { id: sess.sessionId } } }),
  ]);
  await Promise.all(otherSessions.map((session) => invalidateSessionCache(session.id)));
  res.json({ ok: true });
});

export { router };
/* ------------------------ SESSIONS LIST / DELETE ------------------------ */

/**
 * GET /api/auth/sessions
 * Liste toutes les sessions de l'utilisateur courant.
 */
router.get('/auth/sessions', async (req, res) => {
  const sess = await requireSession(req, res);
  if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

  const all = await prisma.session.findMany({
    where: { userId: sess.userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  res.json({
    sessions: all.map(s => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
      current: s.id === sess.sessionId,
    })),
  });
});

/**
 * DELETE /api/auth/sessions/:id
 * Supprime une session précise (y compris éventuellement la session courante).
 */
router.delete('/auth/sessions/:id', async (req, res) => {
  const sess = await requireSession(req, res);
  if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

  const { id } = req.params;

  // on s'assure que la session appartient bien à l'utilisateur courant
  const target = await prisma.session.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });

  if (!target || target.userId !== sess.userId) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  await prisma.session.delete({ where: { id } });
  await invalidateSessionCache(id);

  // si on supprime la session courante → on nettoie le cookie aussi
  if (id === sess.sessionId) {
    clearSessionCookie(res);
  }

  res.json({ ok: true });
});

/**
 * DELETE /api/auth/sessions/others
 * Supprime toutes les sessions sauf la session courante.
 */
router.delete('/auth/sessions/others', async (req, res) => {
  const sess = await requireSession(req, res);
  if (!sess) return res.status(401).json({ error: 'NO_SESSION' });

  const otherSessions = await prisma.session.findMany({
    where: {
      userId: sess.userId,
      NOT: { id: sess.sessionId },
    },
    select: { id: true },
  });

  await prisma.session.deleteMany({
    where: {
      userId: sess.userId,
      NOT: { id: sess.sessionId },
    },
  });
  await Promise.all(otherSessions.map((session) => invalidateSessionCache(session.id)));

  res.json({ ok: true });
});


// POST /api/auth/email/verification-link
// POST /api/auth/email/verification-link
router.post('/auth/email/verification-link', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (!user) return res.status(401).json({ error: 'NO_SESSION' });

    // déjà vérifié → on ne renvoie pas de mail
    if (user.emailVerifiedAt) {
      return res.status(204).end();
    }

    // on supprime les anciens tokens de ce user
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 h

    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });


    const verifyUrl = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;



    await sendMail({
      to: user.email,
      subject: 'Verify your email for Epion',
      text: `Click this link to verify your email:\n\n${verifyUrl}`,
      html: `<p>Click this link to verify your email:</p>
             <p><a href="${verifyUrl}">${verifyUrl}</a></p>
             <p>This link is valid for 24 hours.</p>`,
    });

    return res.status(204).end();
  } catch (e) {
    logger.error('[AUTH] Email verification error', { error: (e as any).message });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});



// POST /api/auth/verify-email
router.post('/auth/verify-email', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'INVALID_LINK' });
    }

    const record = await prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!record) {
      return res.status(400).json({ error: 'INVALID_LINK' });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'EXPIRED_LINK' });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      prisma.emailVerificationToken.delete({
        where: { id: record.id },
      }),
    ]);

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
