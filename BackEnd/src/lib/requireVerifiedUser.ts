// BackEnd/src/lib/requireVerifiedUser.ts
import type { Request, Response } from 'express';
import { prisma } from './db';
import { requireSession } from './session';

type RequireVerifiedResult =
  | { session: { userId: string; sessionId: string }; user: { id: string; emailVerifiedAt: Date | null } }
  | null;

/**
 * Helper pour exiger :
 *  - une session valide
 *  - un email vérifié
 *
 * Si non vérifié → répond 403 + error: 'EMAIL_NOT_VERIFIED'
 * Si pas de session → laisse requireSession gérer (401).
 */
export async function requireVerifiedUser(
  req: Request,
  res: Response,
): Promise<RequireVerifiedResult> {
  const sess = await requireSession(req, res);
  if (!sess) return null;

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { id: true, emailVerifiedAt: true },
  });

  if (!user) {
    res.status(401).json({ error: 'INVALID_SESSION', message: 'Session invalid.' });
    return null;
  }

  if (!user.emailVerifiedAt) {
    res.status(403).json({
      error: 'EMAIL_NOT_VERIFIED',
      message: 'Email must be verified to perform this action.',
    });
    return null;
  }

  return { session: sess, user };
}
