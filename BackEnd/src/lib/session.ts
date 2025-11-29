// BackEnd/src/lib/session.ts
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from './db';
import { env } from '../env';

const COOKIE_NAME = env.COOKIE_NAME || 'epion_session';

// Vérification du secret en fonction de l'environnement
if (
  env.NODE_ENV === 'production' &&
  (!env.JWT_SECRET || env.JWT_SECRET === 'dev-secret-change-me')
) {
  throw new Error(
    'Unsafe JWT_SECRET for production. Set a strong JWT_SECRET in environment.',
  );
}

const JWT_SECRET = env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 jours

export function createJwtForSession(userId: string, sessionId: string) {
  return jwt.sign({ sub: userId, sid: sessionId }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

export function setSessionCookie(res: Response, token: string) {
  const isProd = env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export async function requireSession(
  req: Request,
  res: Response,
): Promise<{ userId: string; sessionId: string } | null> {
  const raw = req.cookies?.[COOKIE_NAME];

  if (!raw) {
    // si pas de cookie → on s’assure qu’il n’en reste pas
    clearSessionCookie(res);
    return null;
  }

  try {
    const decoded = jwt.verify(raw, JWT_SECRET) as {
      sub: string;
      sid: string;
    };

    const sess = await prisma.session.findUnique({
      where: { id: decoded.sid },
      select: { id: true, userId: true, expiresAt: true },
    });

    if (!sess) {
      clearSessionCookie(res);
      return null;
    }

    const sessAny = sess as any;

    if (
      (sess.expiresAt && sess.expiresAt < new Date()) ||
      (sessAny.revokedAt && sessAny.revokedAt < new Date())
    ) {
      clearSessionCookie(res);
      return null;
    }

    return { userId: decoded.sub, sessionId: decoded.sid };
  } catch {
    clearSessionCookie(res);
    return null;
  }
}
