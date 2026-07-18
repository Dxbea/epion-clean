import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { EditorialEvidenceSnapshot } from '../editorial-brief/types.js';
import { OpenAIEditorialClaimCritic } from './draft-generator.js';
import {
  hashEditorialDraftArtifact,
  renderEditorialDraftHtml,
  resolveEditorialDraftConfig,
} from './draft-service.js';
import { validateEditorialClaimReviews, validateEditorialDraftArtifact } from './draft-validation.js';
import { calculateEditorialQualityGate } from './quality-gate.js';
import {
  EDITORIAL_CRITIC_PROMPT_VERSION,
  EDITORIAL_QUALITY_GATE_VERSION,
  type EditorialClaimCritic,
  type EditorialDraftArtifact,
  type EditorialQualityGateResult,
} from './types.js';

export class EditorialRevisionBlockedError extends Error {
  readonly code: string;
  readonly status = 409;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EditorialRevisionBlockedError';
    this.code = code;
  }
}

export interface EditorialCorrectionInput {
  draftId: string;
  correctedByUserId: string;
  expectedContentHash: string;
  correctionNote: string;
  artifact: unknown;
}

export interface EditorialCorrectionResult {
  draftId: string;
  revisionId: string;
  version: number;
  contentHash: string;
  status: 'REVISION_PENDING_GATE';
  invalidatedDecisions: number;
  invalidatedAuthorizations: number;
}

export async function createEditorialDraftCorrection(
  client: PrismaClient,
  input: EditorialCorrectionInput,
): Promise<EditorialCorrectionResult> {
  validateIdentifiers(input.draftId, input.correctedByUserId);
  const correctionNote = meaningfulNote(input.correctionNote, 'correctionNote');
  const admin = await requireAdmin(client, input.correctedByUserId);
  const draft = await client.editorialDraft.findUnique({
    where: { id: input.draftId },
    include: {
      currentRevision: true,
      qualityGate: true,
      reviewDecisions: { where: { active: true }, select: { id: true } },
      publicationAuthorizations: { where: { status: 'AUTHORIZED' }, select: { id: true } },
      brief: { include: { dossier: { include: { evidence: { orderBy: { position: 'asc' } } } } } },
    },
  });
  if (!draft?.currentRevision || !draft.contentHash) throw new Error('Editorial draft has no versioned artifact to correct');
  assertExpectedHash(draft.contentHash, input.expectedContentHash);
  if (draft.currentRevision.contentHash !== draft.contentHash) {
    throw new EditorialRevisionBlockedError('EDITORIAL_REVISION_STALE', 'Current revision does not match the draft artifact');
  }
  const evidence = draft.brief.dossier.evidence.map(toEvidenceSnapshot);
  const config = resolveEditorialDraftConfig(jsonObject(draft.configuration));
  const artifact = validateEditorialDraftArtifact(input.artifact, evidence, config.maximumClaims);
  const contentHash = hashEditorialDraftArtifact(artifact);
  if (contentHash === draft.contentHash) {
    throw new EditorialRevisionBlockedError('EDITORIAL_CORRECTION_UNCHANGED', 'Correction must create a changed editorial artifact');
  }
  const contentHtml = renderEditorialDraftHtml(artifact);
  const version = draft.currentRevision.version + 1;
  const revisionId = randomUUID();
  const now = new Date();

  return client.$transaction(async (transaction) => {
    const invalidatedDecisions = await transaction.editorialReviewDecision.updateMany({
      where: { draftId: draft.id, active: true },
      data: { active: false, invalidatedAt: now, invalidationReason: 'SUPERSEDED_BY_CORRECTION' },
    });
    const invalidatedAuthorizations = await transaction.editorialPublicationAuthorization.updateMany({
      where: { draftId: draft.id, status: 'AUTHORIZED' },
      data: {
        status: 'INVALIDATED',
        invalidatedAt: now,
        invalidationReason: 'SUPERSEDED_BY_CORRECTION',
      },
    });
    const superseded = await transaction.editorialDraftRevision.updateMany({
      where: {
        id: draft.currentRevision!.id,
        draftId: draft.id,
        contentHash: draft.contentHash!,
        status: { not: 'SUPERSEDED' },
      },
      data: { status: 'SUPERSEDED' },
    });
    if (superseded.count !== 1) {
      throw new EditorialRevisionBlockedError('EDITORIAL_CORRECTION_CONFLICT', 'Editorial draft was corrected concurrently');
    }
    await transaction.editorialQualityGate.deleteMany({ where: { draftId: draft.id } });
    await transaction.editorialDraftClaim.deleteMany({ where: { draftId: draft.id } });
    if (draft.articleId) await transaction.articleSource.deleteMany({ where: { articleId: draft.articleId } });
    await transaction.editorialDraftRevision.create({
      data: {
        id: revisionId,
        draftId: draft.id,
        version,
        parentRevisionId: draft.currentRevision!.id,
        origin: 'ADMIN_CORRECTION',
        status: 'PENDING_CRITIC',
        title: artifact.title,
        summary: artifact.summary,
        contentHtml,
        structuredContent: artifact as unknown as Prisma.InputJsonValue,
        contentHash,
        correctedById: admin.id,
        correctionNote,
      },
    });
    const claimed = await transaction.editorialDraft.updateMany({
      where: {
        id: draft.id,
        currentRevisionId: draft.currentRevision!.id,
        contentHash: draft.contentHash,
      },
      data: {
        currentRevisionId: revisionId,
        status: 'REVISION_PENDING_GATE',
        title: artifact.title,
        summary: artifact.summary,
        contentHtml,
        structuredContent: artifact as unknown as Prisma.InputJsonValue,
        contentHash,
        completedAt: null,
        error: null,
      },
    });
    if (claimed.count !== 1) {
      throw new EditorialRevisionBlockedError('EDITORIAL_CORRECTION_CONFLICT', 'Editorial draft was corrected concurrently');
    }
    await transaction.editorialReviewAuditLog.create({
      data: {
        draftId: draft.id,
        revisionId,
        actorUserId: admin.id,
        action: 'CORRECTION_CREATED',
        contentHash,
        previousStatus: draft.status,
        resultingStatus: 'REVISION_PENDING_GATE',
        articleId: draft.articleId,
        reviewNote: correctionNote,
        details: {
          previousRevisionId: draft.currentRevision!.id,
          previousContentHash: draft.contentHash,
          version,
          invalidatedDecisions: invalidatedDecisions.count,
          invalidatedAuthorizations: invalidatedAuthorizations.count,
          articleSourcesCleared: Boolean(draft.articleId),
        },
      },
    });
    if (invalidatedDecisions.count || invalidatedAuthorizations.count) {
      await transaction.editorialReviewAuditLog.create({
        data: {
          draftId: draft.id,
          revisionId,
          actorUserId: admin.id,
          action: 'DECISIONS_INVALIDATED',
          contentHash,
          previousStatus: draft.status,
          resultingStatus: 'REVISION_PENDING_GATE',
          articleId: draft.articleId,
          reviewNote: correctionNote,
          details: {
            reason: 'SUPERSEDED_BY_CORRECTION',
            decisions: invalidatedDecisions.count,
            publicationAuthorizations: invalidatedAuthorizations.count,
          },
        },
      });
    }
    return {
      draftId: draft.id,
      revisionId,
      version,
      contentHash,
      status: 'REVISION_PENDING_GATE' as const,
      invalidatedDecisions: invalidatedDecisions.count,
      invalidatedAuthorizations: invalidatedAuthorizations.count,
    };
  });
}

export interface EditorialRevisionGateInput {
  draftId: string;
  revisionId: string;
  reviewedByUserId: string;
  expectedContentHash: string;
  reviewNote: string;
  critic?: EditorialClaimCritic;
}

export interface EditorialRevisionGateResult {
  draftId: string;
  revisionId: string;
  outcome: 'READY_FOR_REVIEW' | 'QUALITY_FAILED' | 'ALREADY_EVALUATED';
  qualityScore: number;
  publishabilityScore: number;
}

export async function recalculateEditorialRevisionGate(
  client: PrismaClient,
  input: EditorialRevisionGateInput,
): Promise<EditorialRevisionGateResult> {
  validateIdentifiers(input.draftId, input.reviewedByUserId);
  if (!input.revisionId.trim()) throw new Error('revisionId is required');
  const reviewNote = meaningfulNote(input.reviewNote, 'reviewNote');
  const admin = await requireAdmin(client, input.reviewedByUserId);
  const draft = await client.editorialDraft.findUnique({
    where: { id: input.draftId },
    include: {
      currentRevision: true,
      qualityGate: true,
      brief: {
        include: {
          dossier: {
            include: {
              candidate: true,
              evidence: { orderBy: { position: 'asc' } },
            },
          },
        },
      },
    },
  });
  if (!draft?.currentRevision || !draft.contentHash) throw new Error('Editorial draft has no current revision');
  assertCurrentRevision(draft.currentRevision.id, input.revisionId);
  assertExpectedHash(draft.contentHash, input.expectedContentHash);
  if (draft.currentRevision.contentHash !== draft.contentHash) throw new EditorialRevisionBlockedError('EDITORIAL_REVISION_STALE', 'Current revision hash is stale');
  if (draft.currentRevision.status !== 'PENDING_CRITIC') {
    if (draft.qualityGate?.evaluatedContentHash === draft.contentHash) {
      return {
        draftId: draft.id,
        revisionId: draft.currentRevision.id,
        outcome: 'ALREADY_EVALUATED',
        qualityScore: draft.qualityGate.qualityScore,
        publishabilityScore: draft.qualityGate.publishabilityScore,
      };
    }
    throw new EditorialRevisionBlockedError('EDITORIAL_REVISION_NOT_PENDING', 'Revision is not awaiting factual criticism');
  }

  const evidence = draft.brief.dossier.evidence.map(toEvidenceSnapshot);
  const config = resolveEditorialDraftConfig(jsonObject(draft.configuration));
  const artifact = validateEditorialDraftArtifact(draft.currentRevision.structuredContent, evidence, config.maximumClaims);
  if (hashEditorialDraftArtifact(artifact) !== draft.contentHash || renderEditorialDraftHtml(artifact) !== draft.currentRevision.contentHtml) {
    throw new EditorialRevisionBlockedError('EDITORIAL_REVISION_INTEGRITY_MISMATCH', 'Revision artifact failed integrity validation');
  }
  const critic = input.critic ?? new OpenAIEditorialClaimCritic();
  const criticized = await critic.review({ claims: artifact.claims, evidence });
  const reviews = validateEditorialClaimReviews(criticized.reviews, artifact);
  const gate = calculateEditorialQualityGate({
    artifact,
    reviews,
    evidence,
    riskLevel: draft.brief.dossier.candidate.riskLevel,
    config,
  });
  const status = gate.automatedDecision === 'PASSED' ? 'READY_FOR_REVIEW' : 'QUALITY_FAILED';
  const revisionStatus = gate.automatedDecision === 'PASSED' ? 'GATE_PASSED' : 'GATE_FAILED';
  const evidenceByKey = new Map(evidence.map((item) => [item.evidenceKey, item]));
  const databaseEvidenceByKey = new Map(draft.brief.dossier.evidence.map((item) => [item.evidenceKey, item.id]));
  const reviewsByKey = new Map(reviews.map((review) => [review.claimKey, review]));
  const claimRows = buildClaimRows(draft.id, artifact, evidenceByKey, reviewsByKey);
  const now = new Date();

  return client.$transaction(async (transaction) => {
    const claimed = await transaction.editorialDraftRevision.updateMany({
      where: {
        id: draft.currentRevision!.id,
        draftId: draft.id,
        status: 'PENDING_CRITIC',
        contentHash: draft.contentHash!,
      },
      data: {
        status: revisionStatus,
        criticModel: critic.model,
        criticPromptVersion: EDITORIAL_CRITIC_PROMPT_VERSION,
        criticReviews: reviews as unknown as Prisma.InputJsonValue,
        gateSnapshot: gate as unknown as Prisma.InputJsonValue,
        gateEvaluatedAt: now,
      },
    });
    if (claimed.count !== 1) throw new EditorialRevisionBlockedError('EDITORIAL_GATE_CONFLICT', 'Revision was evaluated concurrently');
    await transaction.editorialDraftClaim.deleteMany({ where: { draftId: draft.id } });
    await transaction.editorialDraftClaim.createMany({ data: claimRows });
    await transaction.editorialDraftClaimEvidence.createMany({
      data: claimRows.flatMap((claim) => {
        const review = reviewsByKey.get(claim.claimKey)!;
        const confirmed = new Set(review.evidenceKeys);
        return claim.evidenceKeys.map((evidenceKey, citationOrder) => ({
          claimId: claim.id,
          briefEvidenceId: databaseEvidenceByKey.get(evidenceKey)!,
          citationOrder,
          criticConfirmed: confirmed.has(evidenceKey),
        }));
      }),
    });
    await transaction.editorialQualityGate.create({
      data: qualityGateData(draft.id, draft.contentHash!, gate),
    });
    await transaction.editorialDraft.update({
      where: { id: draft.id },
      data: {
        status,
        completedAt: now,
        metrics: mergeMetrics(draft.metrics, criticized),
      },
    });
    await transaction.editorialReviewAuditLog.create({
      data: {
        draftId: draft.id,
        revisionId: draft.currentRevision!.id,
        actorUserId: admin.id,
        action: 'GATE_RECALCULATED',
        contentHash: draft.contentHash!,
        previousStatus: draft.status,
        resultingStatus: status,
        articleId: draft.articleId,
        reviewNote,
        details: {
          gateVersion: EDITORIAL_QUALITY_GATE_VERSION,
          criticModel: critic.model,
          automatedDecision: gate.automatedDecision,
          reasons: gate.reasons,
        },
      },
    });
    return {
      draftId: draft.id,
      revisionId: draft.currentRevision!.id,
      outcome: status,
      qualityScore: gate.qualityScore,
      publishabilityScore: gate.publishabilityScore,
    };
  });
}

export interface EditorialPublicationAuthorizationInput {
  draftId: string;
  revisionId: string;
  authorizedByUserId: string;
  expectedContentHash: string;
  authorizationNote: string;
}

export interface EditorialPublicationAuthorizationResult {
  draftId: string;
  revisionId: string;
  articleId: string;
  authorizationId: string;
  outcome: 'PUBLICATION_AUTHORIZED' | 'ALREADY_AUTHORIZED';
  articleStatus: 'DRAFT';
}

export async function authorizeEditorialPublication(
  client: PrismaClient,
  input: EditorialPublicationAuthorizationInput,
): Promise<EditorialPublicationAuthorizationResult> {
  validateIdentifiers(input.draftId, input.authorizedByUserId);
  if (!input.revisionId.trim()) throw new Error('revisionId is required');
  const authorizationNote = meaningfulNote(input.authorizationNote, 'authorizationNote');
  const admin = await requireAdmin(client, input.authorizedByUserId);
  const draft = await client.editorialDraft.findUnique({
    where: { id: input.draftId },
    include: {
      currentRevision: {
        include: {
          reviewDecisions: {
            where: { active: true, decisionType: 'APPROVE_DRAFT' },
            orderBy: { createdAt: 'asc' },
          },
          publicationAuthorization: true,
        },
      },
      qualityGate: true,
      article: true,
    },
  });
  if (!draft?.currentRevision || !draft.contentHash || !draft.article) {
    throw new EditorialRevisionBlockedError('EDITORIAL_DRAFT_NOT_APPROVED', 'Publication authorization requires an approved Article DRAFT');
  }
  assertCurrentRevision(draft.currentRevision.id, input.revisionId);
  assertExpectedHash(draft.contentHash, input.expectedContentHash);
  if (draft.currentRevision.contentHash !== draft.contentHash) throw new EditorialRevisionBlockedError('EDITORIAL_REVISION_STALE', 'Current revision hash is stale');
  const existing = draft.currentRevision.publicationAuthorization;
  if (existing?.status === 'AUTHORIZED' && existing.contentHash === draft.contentHash) {
    return {
      draftId: draft.id,
      revisionId: draft.currentRevision.id,
      articleId: existing.articleId,
      authorizationId: existing.id,
      outcome: 'ALREADY_AUTHORIZED',
      articleStatus: 'DRAFT',
    };
  }
  const approval = draft.currentRevision.reviewDecisions[0];
  if (
    draft.currentRevision.status !== 'APPROVED'
    || draft.status !== 'ARTICLE_DRAFT_CREATED'
    || draft.qualityGate?.humanReviewStatus !== 'APPROVED'
    || draft.qualityGate.evaluatedContentHash !== draft.contentHash
    || !approval
    || approval.contentHash !== draft.contentHash
  ) {
    throw new EditorialRevisionBlockedError('EDITORIAL_DRAFT_NOT_APPROVED', 'Current revision must pass its gate and APPROVE_DRAFT decision first');
  }
  if (approval.adminUserId === admin.id) {
    throw new EditorialRevisionBlockedError('EDITORIAL_FOUR_EYES_REQUIRED', 'AUTHORIZE_PUBLICATION requires a second distinct ADMIN');
  }
  if (draft.currentRevision.correctedById === admin.id) {
    throw new EditorialRevisionBlockedError('EDITORIAL_CORRECTOR_CANNOT_SECOND_REVIEW', 'The correcting ADMIN cannot authorize their own corrected revision');
  }
  if (draft.article.status !== 'DRAFT' || articleEditorialHash(draft.article.structuredContent) !== draft.contentHash) {
    throw new EditorialRevisionBlockedError('EDITORIAL_ARTICLE_DRAFT_STALE', 'Article DRAFT does not match the approved editorial revision');
  }
  const now = new Date();
  try {
    return await client.$transaction(async (transaction) => {
      const authorization = await transaction.editorialPublicationAuthorization.create({
        data: {
          draftId: draft.id,
          revisionId: draft.currentRevision!.id,
          articleId: draft.article!.id,
          draftApproverId: approval.adminUserId,
          authorizedById: admin.id,
          contentHash: draft.contentHash!,
          decisionType: 'AUTHORIZE_PUBLICATION',
          status: 'AUTHORIZED',
          note: authorizationNote,
          authorizedAt: now,
        },
      });
      await transaction.editorialReviewAuditLog.create({
        data: {
          draftId: draft.id,
          revisionId: draft.currentRevision!.id,
          actorUserId: admin.id,
          action: 'PUBLICATION_AUTHORIZED',
          contentHash: draft.contentHash!,
          previousStatus: draft.status,
          resultingStatus: draft.status,
          articleId: draft.article!.id,
          reviewNote: authorizationNote,
          details: {
            decision: 'AUTHORIZE_PUBLICATION',
            draftApproverId: approval.adminUserId,
            authorizerId: admin.id,
            automaticPublicationAllowed: false,
            articleStatusUnchanged: true,
          },
        },
      });
      return {
        draftId: draft.id,
        revisionId: draft.currentRevision!.id,
        articleId: draft.article!.id,
        authorizationId: authorization.id,
        outcome: 'PUBLICATION_AUTHORIZED' as const,
        articleStatus: 'DRAFT' as const,
      };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const authorization = await client.editorialPublicationAuthorization.findUnique({
      where: { revisionId: draft.currentRevision.id },
    });
    if (!authorization || authorization.status !== 'AUTHORIZED') throw error;
    return {
      draftId: draft.id,
      revisionId: draft.currentRevision.id,
      articleId: authorization.articleId,
      authorizationId: authorization.id,
      outcome: 'ALREADY_AUTHORIZED',
      articleStatus: 'DRAFT',
    };
  }
}

function buildClaimRows(
  draftId: string,
  artifact: EditorialDraftArtifact,
  evidenceByKey: Map<string, EditorialEvidenceSnapshot>,
  reviewsByKey: Map<string, { claimKey: string; verdict: any; explanation: string; evidenceKeys: string[] }>,
) {
  return artifact.claims.map((claim, position) => {
    const cited = claim.evidenceKeys.map((key) => evidenceByKey.get(key)!);
    const review = reviewsByKey.get(claim.claimKey)!;
    return {
      id: randomUUID(),
      draftId,
      claimKey: claim.claimKey,
      position,
      text: claim.text,
      importance: claim.importance,
      evidenceKeys: claim.evidenceKeys,
      citedDocumentIds: unique(cited.map((item) => item.documentId)),
      citedChunkIds: unique(cited.map((item) => item.chunkId)),
      citedDomains: unique(cited.map((item) => item.domain)),
      verdict: review.verdict,
      criticExplanation: review.explanation,
      criticEvidenceKeys: review.evidenceKeys,
    };
  });
}

function qualityGateData(draftId: string, contentHash: string, gate: EditorialQualityGateResult) {
  return {
    draftId,
    gateVersion: EDITORIAL_QUALITY_GATE_VERSION,
    evaluatedContentHash: contentHash,
    qualityScore: gate.qualityScore,
    publishabilityScore: gate.publishabilityScore,
    citationCoverage: gate.citationCoverage,
    supportedClaimRatio: gate.supportedClaimRatio,
    coreClaimSupportRatio: gate.coreClaimSupportRatio,
    independentDomains: gate.independentDomains,
    automatedDecision: gate.automatedDecision,
    automatedReasons: gate.reasons,
    thresholds: gate.thresholds as unknown as Prisma.InputJsonValue,
    humanReviewStatus: 'PENDING' as const,
  };
}

function toEvidenceSnapshot(item: {
  evidenceKey: string;
  documentId: string;
  chunkId: string;
  role: 'PRIMARY' | 'CONTEXT';
  position: number;
  similarity: number;
  documentTitle: string;
  canonicalUrl: string;
  domain: string;
  publishedAt: Date | null;
  chunkPosition: number;
  contentSnapshot: string;
  contentHash: string;
}): EditorialEvidenceSnapshot {
  return { ...item };
}

async function requireAdmin(client: PrismaClient, userId: string) {
  const user = await client.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user || user.role !== 'ADMIN') throw new Error('Editorial revision workflow requires an ADMIN');
  return user;
}

function validateIdentifiers(draftId: string, userId: string): void {
  if (!draftId.trim() || !userId.trim()) throw new Error('draftId and userId are required');
}

function meaningfulNote(value: string, field: string): string {
  const note = value.trim();
  if (note.length < 10) throw new Error(`${field} requires a meaningful note`);
  return note;
}

function assertExpectedHash(contentHash: string, expectedContentHash: string): void {
  if (!expectedContentHash.trim()) throw new Error('expectedContentHash is required');
  if (contentHash !== expectedContentHash) {
    throw new EditorialRevisionBlockedError('EDITORIAL_DRAFT_HASH_MISMATCH', 'Editorial draft changed after review started');
  }
}

function assertCurrentRevision(currentRevisionId: string, requestedRevisionId: string): void {
  if (currentRevisionId !== requestedRevisionId) {
    throw new EditorialRevisionBlockedError('EDITORIAL_REVISION_SUPERSEDED', 'Only the current editorial revision can be reviewed');
  }
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mergeMetrics(
  current: Prisma.JsonValue | null,
  critic: { inputTokens: number | null; outputTokens: number | null; estimatedCostMicros: number | null },
): Prisma.InputJsonValue {
  return {
    ...jsonObject(current),
    lastRevisionCritic: {
      inputTokens: critic.inputTokens,
      outputTokens: critic.outputTokens,
      estimatedCostMicros: critic.estimatedCostMicros,
    },
  } as Prisma.InputJsonValue;
}

function articleEditorialHash(value: Prisma.JsonValue | null): string | null {
  const record = jsonObject(value);
  return typeof record.contentHash === 'string' ? record.contentHash : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
