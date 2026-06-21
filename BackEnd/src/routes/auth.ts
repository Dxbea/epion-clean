import { Router } from 'express';
import { env } from '../env.js';
import { prisma } from '../lib/db.js';

export const router = Router();

const BETA_MODE = env.NODE_ENV !== 'test' && env.BETA_MODE;

router.get('/auth/beta-status', (_req, res) => {
  res.json({ betaMode: BETA_MODE });
});

router.post('/auth/verify-invite', async (req, res, next) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'MISSING_CODE' });

    const invite = await prisma.inviteCode.findUnique({ where: { code } });
    if (!invite) return res.status(400).json({ error: 'INVALID_CODE' });
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(400).json({ error: 'EXPIRED_CODE' });
    }
    if (invite.usedCount >= invite.maxUses) {
      return res.status(400).json({ error: 'CODE_FULL' });
    }

    return res.json({ valid: true });
  } catch (error) {
    next(error);
  }
});
