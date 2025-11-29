// BackEnd/src/lib/csrf.ts
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../env';
import { requireSession } from './session';

const CSRF_SECRET = env.JWT_SECRET;

type CsrfPayload = {
  sid: string;
  exp: number; // timestamp ms
};

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function createCsrfToken(sessionId: string): string {
  const payload: CsrfPayload = {
    sid: sessionId,
    exp: Date.now() + 2 * 60 * 60 * 1000, // 2h
  };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  const sig = crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(b64)
    .digest('base64');
  return `${b64}.${sig}`;
}

export function verifyCsrfToken(token: string, expectedSessionId: string): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [b64, sig] = parts;

  const expectedSig = crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(b64)
    .digest('base64');

  if (!safeEqual(sig, expectedSig)) return false;

  let payload: CsrfPayload;
  try {
    const json = Buffer.from(b64, 'base64').toString('utf8');
    payload = JSON.parse(json);
  } catch {
    return false;
  }

  if (payload.sid !== expectedSessionId) return false;
  if (payload.exp < Date.now()) return false;

  return true;
}

/**
 * Middleware global CSRF pour les routes /api
 * - ignore GET / HEAD / OPTIONS
 * - ignore /auth/* (login/register/forgot) pour ne pas casser l’existant
 * - exige X-CSRF-Token sur POST/PUT/PATCH/DELETE avec session valide
 */
export async function csrfRequired(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  const safe = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

  // Chemins à exclure de la vérif CSRF
  const path = req.path || '';
  if (
    safe ||
    path === '/csrf' ||               // endpoint de récupération du token
    path.startsWith('/auth/')         // login / register / forgot...
  ) {
    return next();
  }

  const sess = await requireSession(req, res);
  if (!sess) {
    return res.status(401).json({ error: 'NO_SESSION' });
  }

  const token =
    (req.headers['x-csrf-token'] as string | undefined) ||
    (req.headers['X-CSRF-Token'] as string | undefined);

  if (!token || !verifyCsrfToken(token, sess.sessionId)) {
    return res.status(403).json({ error: 'BAD_CSRF_TOKEN' });
  }

  // on passe la session plus loin si besoin
  (req as any).session = sess;

  return next();
}
