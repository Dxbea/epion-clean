import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { ConnectionOptions } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { getCurrentUser, type CurrentUser } from '../lib/currentUser.js';
import {
  createEditorialVerificationQueues,
  createEditorialVerificationRedisConnection,
} from '../lib/editorial-verification/verification-queue.js';
import { resolveEditorialVerificationRuntimeFlags } from '../lib/editorial-verification/runtime-flags.js';
import { resolveEditorialShadowOpsFlags } from '../lib/editorial-verification/ops-flags.js';
import {
  buildEditorialOperationalAlerts,
  getEditorialCalibrationSummary,
  getEditorialQueueSnapshot,
  listEditorialVerificationBudgets,
  listEditorialVerificationRuns,
  listPendingEditorialSerperDocuments,
  type EditorialOpsQueues,
} from '../lib/editorial-verification/ops-service.js';
import {
  reconcileEditorialVerificationRun,
  replayEditorialVerificationDlqJob,
  replayEditorialVerificationRun,
} from '../lib/editorial-verification/ops-actions.js';

const readLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
const actionLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const actionSchema = z.object({
  expectedContentHash: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(10).max(2_000),
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();
const statuses = new Set(['PENDING', 'RUNNING', 'PASSED', 'HUMAN_REVIEW_REQUIRED', 'FAILED']);
const shadowDecisions = new Set(['WOULD_AUTO_PUBLISH', 'WOULD_REQUIRE_HUMAN', 'WOULD_REJECT']);

export interface AdminEditorialOpsDependencies {
  client: PrismaClient;
  currentUser: typeof getCurrentUser;
  withQueues: <T>(callback: (queues: EditorialOpsQueues & any) => Promise<T>) => Promise<T>;
  opsFlags: ReturnType<typeof resolveEditorialShadowOpsFlags>;
  runtimeFlags: ReturnType<typeof resolveEditorialVerificationRuntimeFlags>;
  readLimiter: RequestHandler;
  actionLimiter: RequestHandler;
}

const defaults: AdminEditorialOpsDependencies = {
  client: prisma,
  currentUser: getCurrentUser,
  withQueues: withEditorialOpsQueues,
  opsFlags: resolveEditorialShadowOpsFlags(),
  runtimeFlags: resolveEditorialVerificationRuntimeFlags(),
  readLimiter,
  actionLimiter,
};

export function createAdminEditorialOpsRouter(dependencies: Partial<AdminEditorialOpsDependencies> = {}): Router {
  const deps = { ...defaults, ...dependencies };
  const router = Router();
  const root = '/admin/editorial-ops';
  router.use(root, requireEditorialOpsAdmin(deps.currentUser), deps.readLimiter);

  router.get(`${root}/runs`, async (req, res, next) => {
    try {
      const status = optionalQuery(req.query.status);
      const shadowDecision = optionalQuery(req.query.shadowDecision);
      if (status && !statuses.has(status)) return res.status(400).json({ error: 'INVALID_VERIFICATION_STATUS' });
      if (shadowDecision && !shadowDecisions.has(shadowDecision)) return res.status(400).json({ error: 'INVALID_SHADOW_DECISION' });
      return res.json(await listEditorialVerificationRuns(deps.client, {
        status: status ?? undefined, shadowDecision: shadowDecision ?? undefined,
        cursor: optionalQuery(req.query.cursor) ?? undefined, limit: integerQuery(req.query.limit),
      }));
    } catch (error) { next(error); }
  });

  router.get(`${root}/budgets`, async (req, res, next) => {
    try {
      const result = await listEditorialVerificationBudgets(deps.client, integerQuery(req.query.days));
      return res.json({ ...result, limits: publicBudgetLimits(deps.runtimeFlags) });
    } catch (error) { next(error); }
  });

  router.get(`${root}/jobs`, async (_req, res, next) => {
    try { return res.json(await deps.withQueues((queues) => getEditorialQueueSnapshot(queues))); }
    catch (error) { next(error); }
  });

  router.get(`${root}/dlq`, async (_req, res, next) => {
    try {
      const snapshot = await deps.withQueues((queues) => getEditorialQueueSnapshot(queues));
      return res.json({ counts: snapshot.dlqCounts, jobs: snapshot.dlq });
    } catch (error) { next(error); }
  });

  router.get(`${root}/serper-documents`, async (req, res, next) => {
    try { return res.json(await listPendingEditorialSerperDocuments(deps.client, integerQuery(req.query.limit))); }
    catch (error) { next(error); }
  });

  router.get(`${root}/calibration`, async (req, res, next) => {
    try {
      const days = Math.min(90, Math.max(1, integerQuery(req.query.days) ?? 30));
      const summary = await getEditorialCalibrationSummary(deps.client, new Date(Date.now() - days * 24 * 60 * 60_000));
      return res.json({ mode: 'SHADOW_ONLY', enabled: deps.opsFlags.calibrationEnabled, ...summary });
    } catch (error) { next(error); }
  });

  router.get(`${root}/alerts`, async (_req, res, next) => {
    try {
      return res.json(await deps.withQueues((queues) => buildEditorialOperationalAlerts({
        client: deps.client, queues, opsFlags: deps.opsFlags, runtimeFlags: deps.runtimeFlags,
      })));
    } catch (error) { next(error); }
  });

  router.get(`${root}/overview`, async (_req, res, next) => {
    try {
      const [calibration, budgets, alerts] = await Promise.all([
        getEditorialCalibrationSummary(deps.client, new Date(Date.now() - 30 * 24 * 60 * 60_000)),
        listEditorialVerificationBudgets(deps.client, 14),
        deps.withQueues((queues) => buildEditorialOperationalAlerts({ client: deps.client, queues, opsFlags: deps.opsFlags, runtimeFlags: deps.runtimeFlags })),
      ]);
      return res.json({
        mode: 'SHADOW_ONLY', flags: publicOpsFlags(deps.opsFlags),
        worker: { enabled: deps.runtimeFlags.enabled, killSwitch: deps.runtimeFlags.killSwitch },
        calibration, budgets, alerts,
      });
    } catch (error) { next(error); }
  });

  router.post(`${root}/runs/:runId/replay`, deps.actionLimiter, actionHandler(deps, 'RUN_REPLAY'));
  router.post(`${root}/runs/:runId/reconcile`, deps.actionLimiter, actionHandler(deps, 'RUN_RECONCILE'));
  router.post(`${root}/dlq/:jobId/replay`, deps.actionLimiter, actionHandler(deps, 'DLQ_REPLAY'));
  return router;
}

function actionHandler(deps: AdminEditorialOpsDependencies, action: 'RUN_REPLAY' | 'RUN_RECONCILE' | 'DLQ_REPLAY'): RequestHandler {
  return async (req, res, next) => {
    try {
      const parsed = actionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'INVALID_EDITORIAL_OPS_ACTION', issues: parsed.error.issues });
      const admin = res.locals.editorialOpsAdminUser as CurrentUser;
      const input = { ...parsed.data, actorUserId: admin.id };
      const result = await deps.withQueues(async (queues) => {
        if (action === 'RUN_REPLAY') return replayEditorialVerificationRun(deps.client, queues.verificationQueue, deps.opsFlags, String(req.params.runId), input);
        if (action === 'RUN_RECONCILE') return reconcileEditorialVerificationRun(deps.client, queues.verificationQueue, deps.opsFlags, String(req.params.runId), input);
        return replayEditorialVerificationDlqJob(deps.client, queues, deps.opsFlags, String(req.params.jobId), input);
      });
      return res.status(result.idempotent ? 200 : 202).json(result);
    } catch (error) { next(error); }
  };
}

async function withEditorialOpsQueues<T>(callback: (queues: EditorialOpsQueues & any) => Promise<T>): Promise<T> {
  const connection = createEditorialVerificationRedisConnection();
  const queues = createEditorialVerificationQueues(connection as unknown as ConnectionOptions);
  try { return await callback(queues); }
  finally {
    await queues.verificationQueue.close();
    await queues.deadLetterQueue.close();
    await connection.quit();
  }
}

function requireEditorialOpsAdmin(currentUser: typeof getCurrentUser): RequestHandler {
  return async (req, res, next) => {
    try {
      const user = await currentUser(req, res);
      if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
      if (user.role !== 'ADMIN') return res.status(403).json({ error: 'FORBIDDEN' });
      res.locals.editorialOpsAdminUser = user;
      return next();
    } catch (error) { next(error); }
  };
}

function optionalQuery(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function integerQuery(value: unknown): number | undefined { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined; }
function publicOpsFlags(flags: AdminEditorialOpsDependencies['opsFlags']) { return { calibrationEnabled: flags.calibrationEnabled, mutationsEnabled: flags.mutationsEnabled, killSwitch: flags.killSwitch }; }
function publicBudgetLimits(flags: AdminEditorialOpsDependencies['runtimeFlags']) {
  return {
    verifications: flags.maxVerificationsPerDay, serper: flags.maxSerperRequestsPerDay,
    mistral: flags.maxMistralRequestsPerDay, openai: flags.maxOpenAIRequestsPerDay,
    estimatedCostMicros: flags.maxEstimatedCostMicrosPerDay,
  };
}

export const router = createAdminEditorialOpsRouter();
