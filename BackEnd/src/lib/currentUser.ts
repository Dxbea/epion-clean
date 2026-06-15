import type { Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { fromNodeHeaders } from 'better-auth/node';

import { auth } from './better-auth.js';
import { prisma } from './db.js';

export type CurrentUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  username: string | null;
  phone: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  followersCount: number;
  followingCount: number;
  role: Role;
  sessionId: string;
};

export type CurrentSession = {
  userId: string;
  sessionId: string;
};

const currentUserSelect = {
  id: true,
  email: true,
  emailVerified: true,
  name: true,
  username: true,
  phone: true,
  avatarUrl: true,
  bannerUrl: true,
  bio: true,
  followersCount: true,
  followingCount: true,
  role: true,
} as const;

async function getBetterAuthSession(req: Request) {
  return auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
    query: {
      disableCookieCache: true,
    },
  });
}

export async function getCurrentUser(req: Request, _res?: Response): Promise<CurrentUser | null> {
  const betterAuthSession = await getBetterAuthSession(req);
  if (!betterAuthSession) return null;

  const sessionId = betterAuthSession.session.id;
  const userId = betterAuthSession.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: currentUserSelect,
  });

  if (!user) return null;
  return { ...user, sessionId };
}

export async function getCurrentSession(req: Request, res?: Response): Promise<CurrentSession | null> {
  const user = await getCurrentUser(req, res);
  if (!user) return null;
  return { userId: user.id, sessionId: user.sessionId };
}

export async function getCurrentUserId(req: Request, res?: Response): Promise<string> {
  const user = await getCurrentUser(req, res);
  if (!user) {
    const err: any = new Error('UNAUTHENTICATED');
    err.status = 401;
    err.code = 'UNAUTHENTICATED';
    throw err;
  }
  return user.id;
}
