import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/db.js';
import { getCurrentUser } from '../lib/currentUser.js';
import { recalculateBridgingScores } from '../services/bridgingService.js';

export const router = Router();

async function requireAdmin(req: Request, res: Response) {
  const user = await getCurrentUser(req, res);
  if (!user) {
    return { response: res.status(401).json({ error: 'UNAUTHENTICATED' }) };
  }
  if (user.role !== 'ADMIN') {
    return { response: res.status(403).json({ error: 'FORBIDDEN' }) };
  }
  return { user };
}

router.post('/admin/fix-authors', async (req, res, next) => {
  try {
    const auth = await requireAdmin(req, res);
    if ('response' in auth) return auth.response;
    const user = auth.user;

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

router.post('/admin/recalc-bridging', async (req, res, next) => {
  try {
    const auth = await requireAdmin(req, res);
    if ('response' in auth) return auth.response;

    const processed = await recalculateBridgingScores();
    res.json({ processed });
  } catch (e) {
    next(e);
  }
});

router.get('/admin/contribution-reports', async (req, res, next) => {
  try {
    const auth = await requireAdmin(req, res);
    if ('response' in auth) return auth.response;

    const status = typeof req.query.status === 'string' ? req.query.status : 'PENDING';
    const allowedStatuses = new Set(['PENDING', 'DISMISSED', 'REVIEWED', 'ACTIONED']);
    if (!allowedStatuses.has(status)) {
      return res.status(400).json({ error: 'invalid_report_status' });
    }

    const reports = await (prisma as any).articleContributionReport.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        reason: true,
        details: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        contribution: {
          select: {
            id: true,
            text: true,
            sourceUrl: true,
            status: true,
            article: { select: { id: true, slug: true, title: true } },
            user: { select: { id: true, name: true, username: true, email: true } },
          },
        },
        reporter: { select: { id: true, name: true, username: true, email: true } },
        reviewedBy: { select: { id: true, name: true, username: true, email: true } },
      },
    });

    res.json({
      reports: reports.map((report: any) => ({
        ...report,
        createdAt: report.createdAt.toISOString(),
        reviewedAt: report.reviewedAt?.toISOString() ?? null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/contribution-reports/:id/action', async (req, res, next) => {
  try {
    const auth = await requireAdmin(req, res);
    if ('response' in auth) return auth.response;

    const action = req.body?.action;
    if (!['DISMISS', 'HIDE_CONTRIBUTION', 'MARK_REVIEWED'].includes(action)) {
      return res.status(400).json({ error: 'invalid_report_action' });
    }

    const report = await (prisma as any).articleContributionReport.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, contributionId: true },
    });
    if (!report) return res.status(404).json({ error: 'report_not_found' });

    const now = new Date();
    let status = 'REVIEWED';

    if (action === 'DISMISS') {
      status = 'DISMISSED';
    }

    if (action === 'HIDE_CONTRIBUTION') {
      status = 'ACTIONED';
      await (prisma as any).articleContribution.update({
        where: { id: report.contributionId },
        data: { status: 'HIDDEN' },
      });
    }

    const updated = await (prisma as any).articleContributionReport.update({
      where: { id: report.id },
      data: {
        status,
        reviewedAt: now,
        reviewedById: auth.user.id,
      },
      select: {
        id: true,
        status: true,
        reviewedAt: true,
      },
    });

    res.json({
      id: updated.id,
      status: updated.status,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
    });
  } catch (e) {
    next(e);
  }
});
