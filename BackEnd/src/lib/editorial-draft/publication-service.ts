import { Prisma, type PrismaClient } from '@prisma/client';
import { EditorialRevisionBlockedError } from './revision-service.js';
import { EDITORIAL_QUALITY_GATE_VERSION } from './types.js';

export interface PublishEditorialArticleInput {
  draftId: string;
  revisionId: string;
  publishedByUserId: string;
  expectedContentHash: string;
  publicationNote: string;
  now?: Date;
}

export interface PublishEditorialArticleResult {
  draftId: string;
  revisionId: string;
  articleId: string;
  authorizationId: string;
  outcome: 'ARTICLE_PUBLISHED' | 'ALREADY_PUBLISHED';
  articleStatus: 'PUBLISHED';
  publishedAt: Date;
}

export async function publishEditorialArticle(
  client: PrismaClient,
  input: PublishEditorialArticleInput,
): Promise<PublishEditorialArticleResult> {
  validateInput(input.draftId, input.revisionId, input.publishedByUserId, input.expectedContentHash);
  const publicationNote = meaningfulNote(input.publicationNote, 'publicationNote');
  const publisher = await requireAdmin(client, input.publishedByUserId);
  const now = input.now ?? new Date();
  const draft = await loadPublicationState(client, input.draftId);
  const state = validatePublicationState(draft, input.revisionId, input.expectedContentHash);

  if (state.authorization.status === 'AUTHORIZED' && state.authorization.expiresAt <= now) {
    const expired = await markAuthorizationExpired(client, {
      draftId: state.draftId,
      revisionId: state.revisionId,
      articleId: state.articleId,
      authorizationId: state.authorization.id,
      actorUserId: publisher.id,
      contentHash: state.contentHash,
      draftStatus: state.draftStatus,
      expiresAt: state.authorization.expiresAt,
      now,
    });
    if (expired) {
      throw new EditorialRevisionBlockedError('EDITORIAL_PUBLICATION_AUTHORIZATION_EXPIRED', 'Publication authorization has expired');
    }
    throw new EditorialRevisionBlockedError('EDITORIAL_PUBLICATION_STATE_CHANGED', 'Publication authorization changed concurrently');
  }

  if (state.articleStatus === 'PUBLISHED') {
    return idempotentPublishedResult(state);
  }
  if (state.authorization.status !== 'AUTHORIZED') {
    throw authorizationStateError(state.authorization.status);
  }

  return client.$transaction(async (transaction) => {
    const articleClaim = await transaction.article.updateMany({
      where: { id: state.articleId, status: 'DRAFT' },
      data: { status: 'PUBLISHED', publishedAt: now },
    });
    if (articleClaim.count !== 1) {
      const concurrent = await loadConcurrentPublicationState(transaction, state.articleId, state.authorization.id);
      if (
        concurrent.article?.status === 'PUBLISHED'
        && concurrent.article.publishedAt
        && concurrent.authorization?.status === 'CONSUMED'
        && concurrent.authorization.contentHash === state.contentHash
      ) {
        return {
          draftId: state.draftId,
          revisionId: state.revisionId,
          articleId: state.articleId,
          authorizationId: state.authorization.id,
          outcome: 'ALREADY_PUBLISHED' as const,
          articleStatus: 'PUBLISHED' as const,
          publishedAt: concurrent.article.publishedAt,
        };
      }
      throw new EditorialRevisionBlockedError('EDITORIAL_PUBLICATION_CONFLICT', 'Article status changed concurrently');
    }

    const currentSources = await transaction.articleSource.findMany({
      where: { articleId: state.articleId },
      orderBy: { id: 'asc' },
      select: { id: true, sourceId: true, sourceUrlHash: true, provenance: true },
    });
    if (articleSourceFingerprint(currentSources) !== state.sourceFingerprint) {
      throw new EditorialRevisionBlockedError('EDITORIAL_ARTICLE_SOURCES_CHANGED', 'Materialized editorial sources changed while publication was starting');
    }
    const materializedSources = currentSources.length;

    const authorizationClaim = await transaction.editorialPublicationAuthorization.updateMany({
      where: {
        id: state.authorization.id,
        draftId: state.draftId,
        revisionId: state.revisionId,
        articleId: state.articleId,
        contentHash: state.contentHash,
        status: 'AUTHORIZED',
        expiresAt: { gt: now },
        invalidatedAt: null,
        revokedAt: null,
        consumedAt: null,
      },
      data: { status: 'CONSUMED', consumedAt: now },
    });
    if (authorizationClaim.count !== 1) {
      throw new EditorialRevisionBlockedError('EDITORIAL_PUBLICATION_AUTHORIZATION_CHANGED', 'Publication authorization changed concurrently');
    }

    await transaction.editorialReviewAuditLog.create({
      data: {
        draftId: state.draftId,
        revisionId: state.revisionId,
        actorUserId: publisher.id,
        action: 'ARTICLE_PUBLISHED',
        contentHash: state.contentHash,
        previousStatus: state.draftStatus,
        resultingStatus: state.draftStatus,
        articleId: state.articleId,
        reviewNote: publicationNote,
        details: {
          authorizationId: state.authorization.id,
          draftApproverId: state.authorization.draftApproverId,
          publicationAuthorizerId: state.authorization.authorizedById,
          publisherId: publisher.id,
          gateVersion: EDITORIAL_QUALITY_GATE_VERSION,
          qualityScore: state.qualityScore,
          publishabilityScore: state.publishabilityScore,
          materializedSources,
          previousArticleStatus: 'DRAFT',
          resultingArticleStatus: 'PUBLISHED',
          publishedAt: now,
          manualActionRequired: true,
          automaticPublicationAllowed: false,
        },
      },
    });

    return {
      draftId: state.draftId,
      revisionId: state.revisionId,
      articleId: state.articleId,
      authorizationId: state.authorization.id,
      outcome: 'ARTICLE_PUBLISHED' as const,
      articleStatus: 'PUBLISHED' as const,
      publishedAt: now,
    };
  });
}

export interface RevokeEditorialAuthorizationInput {
  draftId: string;
  revisionId: string;
  revokedByUserId: string;
  expectedContentHash: string;
  revocationNote: string;
  now?: Date;
}

export interface RevokeEditorialAuthorizationResult {
  draftId: string;
  revisionId: string;
  authorizationId: string;
  outcome: 'PUBLICATION_AUTHORIZATION_REVOKED' | 'ALREADY_REVOKED';
}

export async function revokeEditorialPublicationAuthorization(
  client: PrismaClient,
  input: RevokeEditorialAuthorizationInput,
): Promise<RevokeEditorialAuthorizationResult> {
  validateInput(input.draftId, input.revisionId, input.revokedByUserId, input.expectedContentHash);
  const revocationNote = meaningfulNote(input.revocationNote, 'revocationNote');
  const admin = await requireAdmin(client, input.revokedByUserId);
  const now = input.now ?? new Date();
  const draft = await loadPublicationState(client, input.draftId);
  const state = validatePublicationState(draft, input.revisionId, input.expectedContentHash, false);
  const authorization = state.authorization;
  if (authorization.status === 'REVOKED') {
    return { draftId: state.draftId, revisionId: state.revisionId, authorizationId: authorization.id, outcome: 'ALREADY_REVOKED' };
  }
  if (authorization.status === 'CONSUMED' || state.articleStatus === 'PUBLISHED') {
    throw new EditorialRevisionBlockedError('EDITORIAL_PUBLICATION_ALREADY_CONSUMED', 'A consumed authorization cannot be revoked');
  }
  if (authorization.status !== 'AUTHORIZED') throw authorizationStateError(authorization.status);
  if (authorization.expiresAt <= now) {
    await markAuthorizationExpired(client, {
      draftId: state.draftId,
      revisionId: state.revisionId,
      articleId: state.articleId,
      authorizationId: authorization.id,
      actorUserId: admin.id,
      contentHash: state.contentHash,
      draftStatus: state.draftStatus,
      expiresAt: authorization.expiresAt,
      now,
    });
    throw new EditorialRevisionBlockedError('EDITORIAL_PUBLICATION_AUTHORIZATION_EXPIRED', 'Publication authorization has expired');
  }

  return client.$transaction(async (transaction) => {
    const revoked = await transaction.editorialPublicationAuthorization.updateMany({
      where: {
        id: authorization.id,
        status: 'AUTHORIZED',
        contentHash: state.contentHash,
        expiresAt: { gt: now },
        consumedAt: null,
        invalidatedAt: null,
        revokedAt: null,
      },
      data: {
        status: 'REVOKED',
        revokedAt: now,
        revokedById: admin.id,
        revocationReason: revocationNote,
      },
    });
    if (revoked.count !== 1) {
      const current = await transaction.editorialPublicationAuthorization.findUnique({ where: { id: authorization.id } });
      if (current?.status === 'REVOKED') {
        return { draftId: state.draftId, revisionId: state.revisionId, authorizationId: authorization.id, outcome: 'ALREADY_REVOKED' as const };
      }
      throw new EditorialRevisionBlockedError('EDITORIAL_PUBLICATION_AUTHORIZATION_CHANGED', 'Publication authorization changed concurrently');
    }
    await transaction.editorialReviewAuditLog.create({
      data: {
        draftId: state.draftId,
        revisionId: state.revisionId,
        actorUserId: admin.id,
        action: 'PUBLICATION_REVOKED',
        contentHash: state.contentHash,
        previousStatus: state.draftStatus,
        resultingStatus: state.draftStatus,
        articleId: state.articleId,
        reviewNote: revocationNote,
        details: { authorizationId: authorization.id, revokedById: admin.id },
      },
    });
    return {
      draftId: state.draftId,
      revisionId: state.revisionId,
      authorizationId: authorization.id,
      outcome: 'PUBLICATION_AUTHORIZATION_REVOKED' as const,
    };
  });
}

async function loadPublicationState(client: PrismaClient, draftId: string) {
  return client.editorialDraft.findUnique({
    where: { id: draftId },
    include: {
      currentRevision: {
        include: {
          reviewDecisions: { where: { active: true, decisionType: 'APPROVE_DRAFT' } },
          publicationAuthorizations: { orderBy: { authorizedAt: 'desc' } },
        },
      },
      qualityGate: true,
      article: {
        include: {
          articleSources: {
            orderBy: { position: 'asc' },
            include: { source: { select: { id: true, domain: true } } },
          },
        },
      },
    },
  });
}

function validatePublicationState(
  draft: Awaited<ReturnType<typeof loadPublicationState>>,
  revisionId: string,
  expectedContentHash: string,
  requirePublishableArticle = true,
) {
  if (!draft?.currentRevision || !draft.contentHash || !draft.article || !draft.articleId) {
    throw new EditorialRevisionBlockedError('EDITORIAL_PUBLICATION_NOT_READY', 'Publication requires a versioned editorial Article DRAFT');
  }
  if (draft.currentRevision.id !== revisionId) {
    throw new EditorialRevisionBlockedError('EDITORIAL_REVISION_SUPERSEDED', 'Only the current editorial revision can be published');
  }
  if (draft.contentHash !== expectedContentHash || draft.currentRevision.contentHash !== draft.contentHash) {
    throw new EditorialRevisionBlockedError('EDITORIAL_DRAFT_HASH_MISMATCH', 'Editorial revision hash changed before publication');
  }
  const gate = draft.qualityGate;
  const activeApproval = draft.currentRevision.reviewDecisions.find((decision) => decision.contentHash === draft.contentHash);
  if (
    draft.status !== 'ARTICLE_DRAFT_CREATED'
    || draft.currentRevision.status !== 'APPROVED'
    || !gate
    || gate.gateVersion !== EDITORIAL_QUALITY_GATE_VERSION
    || gate.automatedDecision !== 'PASSED'
    || gate.humanReviewStatus !== 'APPROVED'
    || gate.evaluatedContentHash !== draft.contentHash
    || !activeApproval
  ) {
    throw new EditorialRevisionBlockedError('EDITORIAL_PUBLICATION_GATE_INVALID', 'Current revision has no valid quality gate and APPROVE_DRAFT decision');
  }
  if (draft.article.id !== draft.articleId) {
    throw new EditorialRevisionBlockedError('EDITORIAL_ARTICLE_LINK_MISMATCH', 'Article is not linked to the editorial draft');
  }
  const articleIdentity = editorialArticleIdentity(draft.article.structuredContent);
  if (
    articleIdentity.origin !== 'EPION_AUTOMATIC_EDITORIAL'
    || articleIdentity.editorialDraftId !== draft.id
    || articleIdentity.editorialRevisionId !== draft.currentRevision.id
    || articleIdentity.contentHash !== draft.contentHash
  ) {
    throw new EditorialRevisionBlockedError('EDITORIAL_ARTICLE_DRAFT_STALE', 'Article does not match the current editorial revision');
  }
  const sources = draft.article.articleSources;
  if (!sources.length || sources.some((source) => source.provenance !== 'EDITORIAL' || !source.sourceId || !source.source?.domain)) {
    throw new EditorialRevisionBlockedError('EDITORIAL_ARTICLE_SOURCES_MISSING', 'Publication requires materialized validated ArticleSource records');
  }
  const authorization = draft.currentRevision.publicationAuthorizations.find((item) =>
    item.draftId === draft.id
    && item.revisionId === draft.currentRevision!.id
    && item.articleId === draft.article!.id
    && item.contentHash === draft.contentHash
    && ['AUTHORIZED', 'CONSUMED', 'REVOKED', 'EXPIRED'].includes(item.status));
  if (!authorization) {
    throw new EditorialRevisionBlockedError('EDITORIAL_PUBLICATION_AUTHORIZATION_MISSING', 'No four-eyes publication authorization matches the current revision');
  }
  if (authorization.draftApproverId === authorization.authorizedById) {
    throw new EditorialRevisionBlockedError('EDITORIAL_FOUR_EYES_REQUIRED', 'Publication authorization does not contain two distinct ADMIN decisions');
  }
  if (authorization.invalidatedAt || authorization.invalidationReason) {
    throw new EditorialRevisionBlockedError('EDITORIAL_PUBLICATION_AUTHORIZATION_INVALIDATED', 'Publication authorization was invalidated');
  }
  if (requirePublishableArticle && !['DRAFT', 'PUBLISHED'].includes(draft.article.status)) {
    throw new EditorialRevisionBlockedError('EDITORIAL_ARTICLE_STATUS_INCOMPATIBLE', 'Article status is incompatible with editorial publication');
  }
  if (draft.article.status === 'PUBLISHED' && (!draft.article.publishedAt || authorization.status !== 'CONSUMED')) {
    throw new EditorialRevisionBlockedError('EDITORIAL_PUBLICATION_STATE_INCONSISTENT', 'Published Article has no matching consumed authorization');
  }
  return {
    draftId: draft.id,
    draftStatus: draft.status,
    revisionId: draft.currentRevision.id,
    contentHash: draft.contentHash,
    articleId: draft.article.id,
    articleStatus: draft.article.status,
    publishedAt: draft.article.publishedAt,
    sourceFingerprint: articleSourceFingerprint(sources),
    qualityScore: gate.qualityScore,
    publishabilityScore: gate.publishabilityScore,
    authorization,
  };
}

function idempotentPublishedResult(state: ReturnType<typeof validatePublicationState>): PublishEditorialArticleResult {
  if (state.authorization.status !== 'CONSUMED' || !state.publishedAt) {
    throw new EditorialRevisionBlockedError('EDITORIAL_PUBLICATION_STATE_INCONSISTENT', 'Published Article cannot be verified idempotently');
  }
  return {
    draftId: state.draftId,
    revisionId: state.revisionId,
    articleId: state.articleId,
    authorizationId: state.authorization.id,
    outcome: 'ALREADY_PUBLISHED',
    articleStatus: 'PUBLISHED',
    publishedAt: state.publishedAt,
  };
}

async function markAuthorizationExpired(
  client: PrismaClient,
  input: {
    draftId: string;
    revisionId: string;
    articleId: string;
    authorizationId: string;
    actorUserId: string;
    contentHash: string;
    draftStatus: 'ARTICLE_DRAFT_CREATED';
    expiresAt: Date;
    now: Date;
  },
): Promise<boolean> {
  return client.$transaction(async (transaction) => {
    const expired = await transaction.editorialPublicationAuthorization.updateMany({
      where: { id: input.authorizationId, status: 'AUTHORIZED', expiresAt: { lte: input.now } },
      data: { status: 'EXPIRED' },
    });
    if (expired.count !== 1) return false;
    await transaction.editorialReviewAuditLog.create({
      data: {
        draftId: input.draftId,
        revisionId: input.revisionId,
        actorUserId: input.actorUserId,
        action: 'PUBLICATION_EXPIRED',
        contentHash: input.contentHash,
        previousStatus: input.draftStatus,
        resultingStatus: input.draftStatus,
        articleId: input.articleId,
        reviewNote: 'Publication authorization expired before use.',
        details: { authorizationId: input.authorizationId, expiresAt: input.expiresAt },
      },
    });
    return true;
  });
}

async function loadConcurrentPublicationState(transaction: Prisma.TransactionClient, articleId: string, authorizationId: string) {
  const [article, authorization] = await Promise.all([
    transaction.article.findUnique({ where: { id: articleId }, select: { status: true, publishedAt: true } }),
    transaction.editorialPublicationAuthorization.findUnique({ where: { id: authorizationId } }),
  ]);
  return { article, authorization };
}

function editorialArticleIdentity(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function articleSourceFingerprint(sources: Array<{ id: string; sourceId: string; sourceUrlHash: string; provenance: string }>): string {
  return JSON.stringify(sources
    .map((source) => ({ id: source.id, sourceId: source.sourceId, sourceUrlHash: source.sourceUrlHash, provenance: source.provenance }))
    .sort((left, right) => left.id.localeCompare(right.id)));
}

function authorizationStateError(status: string): EditorialRevisionBlockedError {
  const code = status === 'REVOKED'
    ? 'EDITORIAL_PUBLICATION_AUTHORIZATION_REVOKED'
    : status === 'EXPIRED'
      ? 'EDITORIAL_PUBLICATION_AUTHORIZATION_EXPIRED'
      : status === 'CONSUMED'
        ? 'EDITORIAL_PUBLICATION_ALREADY_CONSUMED'
        : 'EDITORIAL_PUBLICATION_AUTHORIZATION_INVALIDATED';
  return new EditorialRevisionBlockedError(code, `Publication authorization is ${status.toLowerCase()}`);
}

async function requireAdmin(client: PrismaClient, userId: string) {
  const user = await client.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user || user.role !== 'ADMIN') throw new Error('Manual editorial publication requires an ADMIN');
  return user;
}

function validateInput(draftId: string, revisionId: string, userId: string, contentHash: string): void {
  if (!draftId.trim() || !revisionId.trim() || !userId.trim() || !contentHash.trim()) {
    throw new Error('draftId, revisionId, userId and expectedContentHash are required');
  }
}

function meaningfulNote(value: string, field: string): string {
  const note = value.trim();
  if (note.length < 10) throw new Error(`${field} requires a meaningful note`);
  return note;
}
