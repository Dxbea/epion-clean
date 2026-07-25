import { Prisma, type PrismaClient } from '@prisma/client';
import { EDITORIAL_QUALITY_GATE_VERSION } from '../editorial-draft/types.js';
import { resolveEditorialValidationMode } from '../editorial-draft/validation-mode.js';
import type { EditorialVerificationRuntimeFlags } from './runtime-flags.js';

const OPERATION_PREFIX = 'editorial-autopublish:';

export class EditorialAutoPublicationBlockedError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'EditorialAutoPublicationBlockedError';
  }
}

export interface AutoPublishEditorialArticleInput {
  draftId: string;
  revisionId: string;
  expectedContentHash: string;
  verificationRunId: string;
  flags: EditorialVerificationRuntimeFlags;
  now?: Date;
  environment?: NodeJS.ProcessEnv;
}

export interface AutoPublishEditorialArticleResult {
  outcome: 'ARTICLE_PUBLISHED' | 'ALREADY_PUBLISHED';
  articleId: string;
  publishedAt: Date;
  operationKey: string;
}

export async function autoPublishVerifiedEditorialArticle(
  client: PrismaClient,
  input: AutoPublishEditorialArticleInput,
): Promise<AutoPublishEditorialArticleResult> {
  assertRuntime(input);
  const actorUserId = input.flags.autoPublishSystemUserId!;
  const actor = await client.user.findUnique({ where: { id: actorUserId }, select: { id: true, role: true } });
  if (!actor || actor.role !== 'ADMIN') {
    throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_SYSTEM_ACTOR_INVALID', 'Auto-publication requires a configured ADMIN system actor');
  }
  const state = await loadState(client, input.draftId);
  validateState(state, input, actor.id);
  if (!state?.currentRevision || !state.article || !state.contentHash) {
    throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_DRAFT_NOT_READY', 'Draft state changed before auto-publication');
  }
  const draft = state;
  const revision = state.currentRevision;
  const article = state.article;
  const contentHash = state.contentHash;
  const now = input.now ?? new Date();
  const operationKey = buildAutoPublicationOperationKey(draft.id, revision.id, contentHash);
  const dayStart = startOfUtcDay(now);
  const publishedToday = await client.editorialReviewAuditLog.count({
    where: { action: 'ARTICLE_PUBLISHED', operationKey: { startsWith: OPERATION_PREFIX }, createdAt: { gte: dayStart } },
  });
  if (publishedToday >= input.flags.autoPublishMaxPerDay) {
    throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_DAILY_QUOTA_REACHED', 'Auto-publication daily quota has been reached');
  }

  return client.$transaction(async (transaction) => {
    const claim = await transaction.article.updateMany({
      where: { id: article.id, status: 'DRAFT', publishedAt: null },
      data: { status: 'PUBLISHED', publishedAt: now },
    });
    if (claim.count !== 1) {
      const [publishedArticle, existingAudit] = await Promise.all([
        transaction.article.findUnique({ where: { id: article.id }, select: { status: true, publishedAt: true } }),
        transaction.editorialReviewAuditLog.findUnique({ where: { operationKey } }),
      ]);
      if (publishedArticle?.status === 'PUBLISHED' && publishedArticle.publishedAt && existingAudit) {
        return { outcome: 'ALREADY_PUBLISHED' as const, articleId: article.id, publishedAt: publishedArticle.publishedAt, operationKey };
      }
      throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_ARTICLE_STATE_CHANGED', 'Article state changed before auto-publication');
    }
    await transaction.editorialReviewAuditLog.create({
      data: {
        draftId: draft.id,
        revisionId: revision.id,
        actorUserId,
        action: 'ARTICLE_PUBLISHED',
        contentHash,
        previousStatus: draft.status,
        resultingStatus: draft.status,
        articleId: article.id,
        operationKey,
        reviewNote: 'Publication automatique contrôlée après vérification éditoriale PASSED.',
        details: {
          actorType: 'SYSTEM_AUTOPUBLISH',
          verificationRunId: input.verificationRunId,
          validationMode: 'quality_gate',
          qualityGateVersion: EDITORIAL_QUALITY_GATE_VERSION,
          factCheckScore: article.factCheckScore,
          materializedSources: article.articleSources.length,
          independentDomains: independentDomains(article.articleSources),
          automaticPublicationAllowed: true,
          manualActionRequired: false,
          previousArticleStatus: 'DRAFT',
          resultingArticleStatus: 'PUBLISHED',
          publishedAt: now,
        },
      },
    });
    return { outcome: 'ARTICLE_PUBLISHED' as const, articleId: article.id, publishedAt: now, operationKey };
  });
}

export function buildAutoPublicationOperationKey(draftId: string, revisionId: string, contentHash: string): string {
  return `${OPERATION_PREFIX}${draftId}:${revisionId}:${contentHash}`;
}

function assertRuntime(input: AutoPublishEditorialArticleInput): void {
  if (!input.flags.autoPublishEnabled) throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_DISABLED', 'Auto-publication is disabled');
  if (input.flags.autoPublishKillSwitch) throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_KILL_SWITCH', 'Auto-publication kill switch is active');
  if (!input.flags.autoPublishSystemUserId) throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_SYSTEM_ACTOR_REQUIRED', 'Auto-publication requires EDITORIAL_AUTOPUBLISH_SYSTEM_USER_ID');
  if (resolveEditorialValidationMode(input.environment) !== 'quality_gate') {
    throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_VALIDATION_MODE', 'Auto-publication requires EDITORIAL_VALIDATION_MODE=quality_gate');
  }
}

async function loadState(client: PrismaClient, draftId: string) {
  return client.editorialDraft.findUnique({
    where: { id: draftId },
    include: {
      currentRevision: true,
      qualityGate: true,
      article: { include: { articleSources: { include: { source: { select: { domain: true } } } } } },
      verificationRuns: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
}

function validateState(
  state: Awaited<ReturnType<typeof loadState>>,
  input: AutoPublishEditorialArticleInput,
  actorUserId: string,
): void {
  if (!state?.currentRevision || !state.qualityGate || !state.article || !state.contentHash) {
    throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_DRAFT_NOT_READY', 'Draft, revision, gate and Article are required');
  }
  if (state.id !== input.draftId || state.currentRevision.id !== input.revisionId || state.contentHash !== input.expectedContentHash || state.currentRevision.contentHash !== state.contentHash) {
    throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_REVISION_SUPERSEDED', 'Auto-publication targets a superseded revision');
  }
  if (state.status !== 'ARTICLE_DRAFT_CREATED' || state.currentRevision.status !== 'GATE_PASSED') {
    throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_DRAFT_STATE_INVALID', 'Draft must be the current quality-gated Article DRAFT');
  }
  if (state.qualityGate.gateVersion !== EDITORIAL_QUALITY_GATE_VERSION || state.qualityGate.automatedDecision !== 'PASSED' || state.qualityGate.evaluatedContentHash !== state.contentHash) {
    throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_QUALITY_GATE_INVALID', 'Quality gate is not valid for the current draft');
  }
  const article = state.article;
  if (article.status !== 'DRAFT' || article.publishedAt || !article.categoryId) {
    throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_ARTICLE_NOT_PUBLIC_READY', 'Article must remain an uncategorized-free DRAFT');
  }
  const score = jsonRecord(article.factCheckData);
  if (article.factCheckStatus !== 'COMPLETED' || typeof article.factCheckScore !== 'number' || !article.factCheckContentHash || score.status !== 'COMPLETED' || score.score !== article.factCheckScore || score.contentHash !== article.factCheckContentHash) {
    throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_FACTCHECK_INCOMPLETE', 'Auto-publication requires the completed FactScore contract');
  }
  if (article.articleSources.length < input.flags.autoPublishMinimumSources || independentDomains(article.articleSources) < input.flags.autoPublishMinimumDomains) {
    throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_SOURCES_INSUFFICIENT', 'Auto-publication requires sufficient independent materialized ArticleSource records');
  }
  const verification = state.verificationRuns.find((run) => run.id === input.verificationRunId && run.revisionId === state.currentRevision!.id && run.contentHash === state.contentHash);
  if (!verification || verification.status !== 'PASSED' || verification.articleId !== article.id) {
    throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_VERIFICATION_NOT_PASSED', 'Auto-publication requires the current PASSED verification run');
  }
  if (!actorUserId.trim()) throw new EditorialAutoPublicationBlockedError('AUTOPUBLISH_SYSTEM_ACTOR_REQUIRED', 'System actor is required');
}

function independentDomains(sources: Array<{ source: { domain: string | null } | null }>): number {
  return new Set(sources.map((item) => item.source?.domain?.trim().toLowerCase()).filter((item): item is string => Boolean(item))).size;
}

function jsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
