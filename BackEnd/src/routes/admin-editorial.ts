import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { getCurrentUser, type CurrentUser } from '../lib/currentUser.js';
import { reviewControlledEditorialDraft } from '../lib/editorial-draft/approval-service.js';

const readLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
const decisionLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const reviewBodySchema = z.object({
  expectedContentHash: z.string().trim().min(1).max(128),
  reviewNote: z.string().trim().min(10).max(4_000),
}).strict();

const allowedDraftStatuses = new Set([
  'PENDING', 'GENERATING', 'READY_FOR_REVIEW', 'QUALITY_FAILED',
  'HUMAN_REJECTED', 'ARTICLE_DRAFT_CREATED', 'FAILED',
]);
const allowedHumanStatuses = new Set(['PENDING', 'APPROVED', 'REJECTED']);

export interface AdminEditorialRouterDependencies {
  client: PrismaClient;
  currentUser: typeof getCurrentUser;
  reviewDraft: typeof reviewControlledEditorialDraft;
  readLimiter: RequestHandler;
  decisionLimiter: RequestHandler;
}

const defaults: AdminEditorialRouterDependencies = {
  client: prisma,
  currentUser: getCurrentUser,
  reviewDraft: reviewControlledEditorialDraft,
  readLimiter,
  decisionLimiter,
};

export function createAdminEditorialRouter(
  dependencies: Partial<AdminEditorialRouterDependencies> = {},
): Router {
  const deps = { ...defaults, ...dependencies };
  const router = Router();
  const root = '/admin/editorial-drafts';

  router.use(root, requireEditorialAdmin(deps.currentUser), deps.readLimiter);

  router.get(root, async (req, res, next) => {
    try {
      const status = optionalQuery(req.query.status);
      const humanReviewStatus = optionalQuery(req.query.humanReviewStatus);
      if (status && !allowedDraftStatuses.has(status)) return res.status(400).json({ error: 'INVALID_DRAFT_STATUS' });
      if (humanReviewStatus && !allowedHumanStatuses.has(humanReviewStatus)) return res.status(400).json({ error: 'INVALID_HUMAN_REVIEW_STATUS' });
      const limit = boundedLimit(req.query.limit);
      const cursor = optionalQuery(req.query.cursor);
      const drafts = await deps.client.editorialDraft.findMany({
        where: {
          ...(status ? { status: status as any } : {}),
          ...(humanReviewStatus ? { qualityGate: { humanReviewStatus: humanReviewStatus as any } } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          briefId: true,
          status: true,
          title: true,
          summary: true,
          contentHash: true,
          generatedAt: true,
          completedAt: true,
          articleId: true,
          createdAt: true,
          updatedAt: true,
          qualityGate: {
            select: {
              qualityScore: true,
              publishabilityScore: true,
              automatedDecision: true,
              humanReviewStatus: true,
              independentDomains: true,
              reviewedAt: true,
            },
          },
          _count: { select: { claims: true, auditLogs: true } },
        },
      });
      const hasMore = drafts.length > limit;
      const items = hasMore ? drafts.slice(0, limit) : drafts;
      return res.json({ drafts: items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null });
    } catch (error) {
      next(error);
    }
  });

  router.get(`${root}/:id`, async (req, res, next) => {
    try {
      const draft = await deps.client.editorialDraft.findUnique({
        where: { id: String(req.params.id) },
        include: {
          qualityGate: { include: { reviewedBy: { select: { id: true, name: true, email: true } } } },
          article: { select: { id: true, slug: true, title: true, status: true, createdAt: true } },
          brief: {
            include: {
              dossier: {
                include: {
                  candidate: { include: { topic: true } },
                  evidence: {
                    orderBy: { position: 'asc' },
                    include: { document: { select: { id: true, sourceId: true, status: true } } },
                  },
                },
              },
            },
          },
          claims: {
            orderBy: { position: 'asc' },
            include: {
              evidence: {
                orderBy: { citationOrder: 'asc' },
                include: {
                  briefEvidence: {
                    include: {
                      document: { select: { id: true, sourceId: true, status: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!draft) return res.status(404).json({ error: 'EDITORIAL_DRAFT_NOT_FOUND' });
      return res.json({ draft });
    } catch (error) {
      next(error);
    }
  });

  router.get(`${root}/:id/audit`, async (req, res, next) => {
    try {
      const exists = await deps.client.editorialDraft.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
      if (!exists) return res.status(404).json({ error: 'EDITORIAL_DRAFT_NOT_FOUND' });
      const audit = await deps.client.editorialReviewAuditLog.findMany({
        where: { draftId: exists.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
        include: {
          actor: { select: { id: true, name: true, email: true } },
          article: { select: { id: true, slug: true, status: true } },
        },
      });
      return res.json({ draftId: exists.id, audit });
    } catch (error) {
      next(error);
    }
  });

  router.post(`${root}/:id/approve`, deps.decisionLimiter, decisionHandler(deps, 'APPROVE'));
  router.post(`${root}/:id/reject`, deps.decisionLimiter, decisionHandler(deps, 'REJECT'));
  return router;
}

function decisionHandler(
  deps: AdminEditorialRouterDependencies,
  decision: 'APPROVE' | 'REJECT',
): RequestHandler {
  return async (req, res, next) => {
    try {
      const parsed = reviewBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'INVALID_EDITORIAL_REVIEW', issues: parsed.error.issues });
      const admin = res.locals.editorialAdminUser as CurrentUser;
      const result = await deps.reviewDraft(deps.client, {
        draftId: String(req.params.id),
        reviewerUserId: admin.id,
        decision,
        reviewNote: parsed.data.reviewNote,
        expectedContentHash: parsed.data.expectedContentHash,
      });
      return res.json(result);
    } catch (error) {
      next(error);
    }
  };
}

function requireEditorialAdmin(currentUser: typeof getCurrentUser): RequestHandler {
  return async (req, res, next) => {
    try {
      const user = await currentUser(req, res);
      if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
      if (user.role !== 'ADMIN') return res.status(403).json({ error: 'FORBIDDEN' });
      res.locals.editorialAdminUser = user;
      return next();
    } catch (error) {
      next(error);
    }
  };
}

function optionalQuery(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function boundedLimit(value: unknown): number {
  if (value === undefined) return 25;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 25;
}

export const router = createAdminEditorialRouter();
