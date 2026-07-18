import express, { type RequestHandler } from 'express';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { resolveEditorialShadowOpsFlags } from '../src/lib/editorial-verification/ops-flags.js';
import { resolveEditorialVerificationRuntimeFlags } from '../src/lib/editorial-verification/runtime-flags.js';
import { createAdminEditorialOpsRouter } from '../src/routes/admin-editorial-ops.js';

const noop: RequestHandler = (_req, _res, next) => next();
const admin = { id: 'admin-1', role: 'ADMIN', sessionId: 'session-1' } as any;
const queues = {
  verificationQueue: { add: vi.fn(), getJobCounts: vi.fn().mockResolvedValue({}), getJobs: vi.fn().mockResolvedValue([]) },
  deadLetterQueue: { getJob: vi.fn(), getJobCounts: vi.fn().mockResolvedValue({}), getJobs: vi.fn().mockResolvedValue([]) },
};

function appWith(options: { currentUser?: any; client?: any; flags?: NodeJS.ProcessEnv } = {}) {
  const app = express(); app.use(express.json());
  app.use('/api', createAdminEditorialOpsRouter({
    client: (options.client ?? {}) as PrismaClient,
    currentUser: options.currentUser ?? vi.fn().mockResolvedValue(admin),
    withQueues: async (callback) => callback(queues as never),
    opsFlags: resolveEditorialShadowOpsFlags(options.flags ?? {}),
    runtimeFlags: resolveEditorialVerificationRuntimeFlags({}), readLimiter: noop, actionLimiter: noop,
  }));
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 500).json({ error: error.code ?? 'INTERNAL_ERROR' }));
  return app;
}

describe('private admin editorial shadow operations routes', () => {
  it('requires a session and ADMIN role before operational reads', async () => {
    await request(appWith({ currentUser: vi.fn().mockResolvedValue(null) })).get('/api/admin/editorial-ops/jobs').expect(401);
    await request(appWith({ currentUser: vi.fn().mockResolvedValue({ ...admin, role: 'USER' }) })).get('/api/admin/editorial-ops/jobs').expect(403);
  });

  it('lists verification runs and exposes an explicit shadow-only calibration mode', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const client = { editorialVerificationRun: { findMany } };
    await request(appWith({ client })).get('/api/admin/editorial-ops/runs?shadowDecision=WOULD_AUTO_PUBLISH').expect(200, { runs: [], nextCursor: null });
    const calibration = await request(appWith({ client, flags: { EDITORIAL_SHADOW_CALIBRATION_ENABLED: 'true' } }))
      .get('/api/admin/editorial-ops/calibration?days=7').expect(200);
    expect(calibration.body).toMatchObject({ mode: 'SHADOW_ONLY', enabled: true, totalRuns: 0 });
  });

  it('keeps replay disabled unless all staging mutation flags are explicit', async () => {
    await request(appWith({ client: { editorialReviewAuditLog: { findUnique: vi.fn() } } }))
      .post('/api/admin/editorial-ops/runs/run-1/replay')
      .send({ expectedContentHash: 'hash-1', reason: 'Replay contrôlé pour diagnostic staging.', idempotencyKey: 'request-key-1' })
      .expect(503, { error: 'EDITORIAL_SHADOW_OPS_DISABLED' });
  });
});
