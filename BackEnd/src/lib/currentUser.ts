// BackEnd/src/lib/currentUser.ts
import { prisma } from './db';
import { requireSession } from './session';

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

/**
 * PROD : pas de user démo ici.
 * Si pas de session → on renvoie null et la route décide.
 */
export async function getCurrentUser(
  req: any,
  res: any,
): Promise<CurrentUser | null> {
  const sess = await requireSession(req, res);
  if (!sess) return null;

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) return null;
  return user;
}

/**
 * Helper pratique pour les routes protégées.
 * Si pas de user → on lève une erreur 401 gérée par les routes ou le middleware global.
 */
export async function getCurrentUserId(req: any, res: any): Promise<string> {
  const user = await getCurrentUser(req, res);
  if (!user) {
    const err: any = new Error('UNAUTHENTICATED');
    err.status = 401;
    err.code = 'UNAUTHENTICATED';
    throw err;
  }
  return user.id;
}
