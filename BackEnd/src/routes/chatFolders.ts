// BackEnd/src/routes/chatFolders.ts
import { Router } from 'express';
import { prisma } from '../lib/db';
import { getCurrentUserId } from '../lib/currentUser';

export const router = Router();

// GET /api/chat/folders
router.get('/folders', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res);
    const folders = await prisma.chatFolder.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    res.json(
      folders.map(f => ({
        id: f.id,
        name: f.name,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      }))
    );
  } catch (e) {
    next(e);
  }
});

// POST /api/chat/folders  { name }
router.post('/folders', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res);
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name required' }); // ✅ bloque les vides

    const folder = await prisma.chatFolder.create({
      data: { userId, name },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    res.status(201).json({
      id: folder.id,
      name: folder.name,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    });
  } catch (e) { next(e); }
});

// PATCH /api/chat/folders/:id
router.patch('/folders/:id', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res);
    const id = String(req.params.id);
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });

    const folder = await prisma.chatFolder.findUnique({ where: { id } });
    if (!folder) return res.status(404).json({ error: 'Not found' });
    if (folder.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    const updated = await prisma.chatFolder.update({
      where: { id },
      data: { name, updatedAt: new Date() },
    });

    res.json({
      id: updated.id,
      name: updated.name,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/chat/folders/:id
router.delete('/folders/:id', async (req, res, next) => {
  try {
    const userId = await getCurrentUserId(req, res);
    const id = String(req.params.id);

    const folder = await prisma.chatFolder.findUnique({ where: { id } });
    if (!folder) return res.status(404).json({ error: 'Not found' });
    if (folder.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    await prisma.chatSession.updateMany({
      where: { folderId: id },
      data: { folderId: null },
    });

    await prisma.chatFolder.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
