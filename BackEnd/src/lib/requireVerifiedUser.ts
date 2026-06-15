import type { Request, Response } from 'express';

import { getCurrentUser, type CurrentUser } from './currentUser.js';

type RequireVerifiedResult =
  | { session: { userId: string; sessionId: string }; user: CurrentUser }
  | null;

export async function requireVerifiedUser(
  req: Request,
  res: Response,
): Promise<RequireVerifiedResult> {
  const user = await getCurrentUser(req, res);

  if (!user) {
    res.status(401).json({ error: 'NO_SESSION' });
    return null;
  }

  if (!user.emailVerified) {
    res.status(403).json({
      error: 'EMAIL_NOT_VERIFIED',
      message: 'Email must be verified to perform this action.',
    });
    return null;
  }

  return { session: { userId: user.id, sessionId: user.sessionId }, user };
}
