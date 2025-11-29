// BackEnd/src/routes/categories.ts
import { Router } from 'express';
import { prisma } from '../lib/db';

export const router = Router();

// GET /api/categories
router.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { articles: true }, // compte tous les articles liés
        },
        articles: {
          where: { status: 'PUBLISHED' }, // ici on filtre seulement publiés
          select: { id: true },          // récupère juste l’id pour éviter le poids
        },
      },
    });

    res.json({
      items: rows.map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        articleCount: r.articles.length, // ✅ uniquement publiés
      })),
    });
  } catch (err) {
    next(err);
  }
});
