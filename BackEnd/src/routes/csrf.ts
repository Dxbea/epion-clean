// BackEnd/src/routes/csrf.ts
import { Router } from 'express';
import { requireSession } from '../lib/session';
import { createCsrfToken } from '../lib/csrf';

export const router = Router();

/**
 * GET /api/csrf
 * -> nécessite une session
 * -> renvoie { token }
 */
router.get('/csrf', async (req, res, next) => {
  try {
    const sess = await requireSession(req, res);
    if (!sess) {
      return res.status(401).json({ error: 'NO_SESSION' });
    }

    const token = createCsrfToken(sess.sessionId);
    return res.json({ token });
  } catch (e) {
    next(e);
  }
});
