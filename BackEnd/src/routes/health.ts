import { Router } from 'express';
export const router = Router();

// GET /api/healthz  (if mounted under /api)
router.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'epion-api' });
});

// Optional: shallow check at /api/health
router.get('/health', (_req, res) => res.send('OK'));
