import { Router } from 'express';
import { prisma } from '../lib/db';
import { getCurrentUser } from '../lib/currentUser';

export const router = Router();

router.post('/admin/fix-authors', async (req, res, next) => {
  try {
    const user = await getCurrentUser(req, res);

    if (!user) {
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }

    if (user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    await prisma.article.updateMany({
      where: {
        OR: [
          { authorId: null },
          // garde "undefined as any" par compat prisma mais c'est safe ici
          { authorId: { equals: undefined as any } },
        ],
      },
      data: { authorId: user.id },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
