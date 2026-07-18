import express, { type RequestHandler } from 'express';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { createAdminEditorialRouter } from '../src/routes/admin-editorial.js';

const noopLimiter: RequestHandler = (_req, _res, next) => next();
const admin = { id: 'admin-1', role: 'ADMIN', sessionId: 'session-1' } as any;
const user = { id: 'user-1', role: 'USER', sessionId: 'session-2' } as any;

function appWith(options: {
  currentUser?: any;
  client?: any;
  reviewDraft?: any;
  readLimiter?: RequestHandler;
  decisionLimiter?: RequestHandler;
}) {
  const app = express();
  app.use(express.json());
  app.use('/api', createAdminEditorialRouter({
    client: (options.client ?? {}) as PrismaClient,
    currentUser: options.currentUser ?? vi.fn(async () => admin),
    reviewDraft: options.reviewDraft ?? vi.fn(),
    readLimiter: options.readLimiter ?? noopLimiter,
    decisionLimiter: options.decisionLimiter ?? noopLimiter,
  }));
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 500).json({ error: error.code ?? 'INTERNAL_ERROR' }));
  return app;
}

describe('private admin editorial review routes', () => {
  it('requires a session and ADMIN role before database access', async () => {
    const findMany = vi.fn();
    const client = { editorialDraft: { findMany } };
    await request(appWith({ currentUser: vi.fn(async () => null), client })).get('/api/admin/editorial-drafts').expect(401, { error: 'UNAUTHENTICATED' });
    await request(appWith({ currentUser: vi.fn(async () => user), client })).get('/api/admin/editorial-drafts').expect(403, { error: 'FORBIDDEN' });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('lists review drafts with bounded pagination and applies the private limiter', async () => {
    const readLimiter = vi.fn((_req, _res, next) => next()) as unknown as RequestHandler;
    const findMany = vi.fn(async () => [
      { id: 'draft-2', status: 'READY_FOR_REVIEW' },
      { id: 'draft-1', status: 'QUALITY_FAILED' },
    ]);
    const response = await request(appWith({ client: { editorialDraft: { findMany } }, readLimiter }))
      .get('/api/admin/editorial-drafts?limit=1&status=READY_FOR_REVIEW')
      .expect(200);
    expect(response.body).toEqual({ drafts: [{ id: 'draft-2', status: 'READY_FOR_REVIEW' }], nextCursor: 'draft-2' });
    expect(findMany.mock.calls[0][0]).toMatchObject({ take: 2, where: { status: 'READY_FOR_REVIEW' } });
    expect(readLimiter).toHaveBeenCalledOnce();
  });

  it('returns a full private inspection payload and an audit history', async () => {
    const detail = { id: 'draft-1', brief: { id: 'brief-1' }, claims: [{ claimKey: 'claim-1' }], qualityGate: { automatedDecision: 'PASSED' } };
    const client = {
      editorialDraft: { findUnique: vi.fn()
        .mockResolvedValueOnce(detail)
        .mockResolvedValueOnce({ id: 'draft-1' }) },
      editorialReviewAuditLog: { findMany: vi.fn(async () => [{ id: 'audit-1', action: 'APPROVED' }]) },
    };
    await request(appWith({ client })).get('/api/admin/editorial-drafts/draft-1').expect(200, { draft: detail });
    await request(appWith({ client })).get('/api/admin/editorial-drafts/draft-1/audit').expect(200, { draftId: 'draft-1', audit: [{ id: 'audit-1', action: 'APPROVED' }] });
  });

  it('passes explicit approve and reject decisions with the authenticated admin identity', async () => {
    const reviewDraft = vi.fn(async (_client, input) => ({ draftId: input.draftId, outcome: input.decision, articleId: null }));
    const body = { expectedContentHash: 'a'.repeat(64), reviewNote: 'Reviewed carefully against every cited source.' };
    await request(appWith({ reviewDraft })).post('/api/admin/editorial-drafts/draft-1/approve').send(body).expect(200);
    await request(appWith({ reviewDraft })).post('/api/admin/editorial-drafts/draft-1/reject').send(body).expect(200);
    expect(reviewDraft.mock.calls[0][1]).toMatchObject({ draftId: 'draft-1', reviewerUserId: 'admin-1', decision: 'APPROVE', ...body });
    expect(reviewDraft.mock.calls[1][1]).toMatchObject({ decision: 'REJECT' });
  });

  it('rejects malformed decisions before calling the review service', async () => {
    const reviewDraft = vi.fn();
    await request(appWith({ reviewDraft })).post('/api/admin/editorial-drafts/draft-1/approve').send({ expectedContentHash: '', reviewNote: 'short' }).expect(400);
    expect(reviewDraft).not.toHaveBeenCalled();
  });
});
