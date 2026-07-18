import { Prisma, type EditorialDraftStatus, type PrismaClient } from '@prisma/client';
import {
  buildArticleSourceProfileSnapshot,
  buildArticleSourceUpsertInput,
  normalizeArticleSourceUrl,
} from '../article-source-service.js';
import { sanitizeArticleHtml } from '../sanitizeHtml.js';
import { hashEditorialDraftArtifact, renderEditorialDraftHtml } from './draft-service.js';
import { editorialDraftArtifactToStructuredArticle } from './structured-article-adapter.js';
import { EDITORIAL_QUALITY_GATE_VERSION, type EditorialDraftArtifact } from './types.js';

export interface EditorialHumanReviewInput {
  draftId: string;
  reviewerUserId: string;
  decision: 'APPROVE' | 'REJECT';
  reviewNote: string;
  expectedContentHash: string;
}

export interface EditorialHumanReviewResult {
  draftId: string;
  outcome: 'ARTICLE_DRAFT_CREATED' | 'ALREADY_CREATED' | 'REJECTED' | 'ALREADY_REJECTED';
  articleId: string | null;
}

export class EditorialReviewBlockedError extends Error {
  readonly code: string;
  readonly status = 409;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EditorialReviewBlockedError';
    this.code = code;
  }
}

export async function reviewControlledEditorialDraft(
  client: PrismaClient,
  input: EditorialHumanReviewInput,
): Promise<EditorialHumanReviewResult> {
  if (!input.draftId.trim() || !input.reviewerUserId.trim()) throw new Error('draftId and reviewerUserId are required');
  if (input.reviewNote.trim().length < 10) throw new Error('Human editorial review requires a meaningful review note');
  if (!input.expectedContentHash.trim()) throw new Error('expectedContentHash is required');
  const reviewer = await client.user.findUnique({ where: { id: input.reviewerUserId }, select: { id: true, role: true } });
  if (!reviewer || reviewer.role !== 'ADMIN') throw new Error('Human editorial review requires an ADMIN reviewer');
  const draft = await client.editorialDraft.findUnique({
    where: { id: input.draftId },
    include: {
      currentRevision: {
        include: {
          reviewDecisions: { where: { active: true } },
        },
      },
      qualityGate: true,
      article: { select: { id: true, status: true } },
      brief: { include: { dossier: { include: { candidate: { include: { topic: true } } } } } },
      claims: {
        where: { verdict: { in: ['SUPPORTED', 'PARTIALLY_SUPPORTED'] } },
        include: {
          evidence: {
            where: { criticConfirmed: true },
            include: {
              briefEvidence: {
                include: {
                  document: { include: { source: true } },
                },
              },
            },
            orderBy: { citationOrder: 'asc' },
          },
        },
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!draft || !draft.currentRevision || !draft.qualityGate || !draft.contentHash || !draft.title || !draft.summary || !draft.contentHtml || !draft.structuredContent) {
    throw new Error('Editorial draft is not reviewable');
  }
  if (draft.currentRevision.contentHash !== draft.contentHash) {
    await recordBlockedReview(client, draft, reviewer.id, input.reviewNote, 'CURRENT_REVISION_HASH_MISMATCH', draft.currentRevision.id);
    throw new EditorialReviewBlockedError('EDITORIAL_REVISION_STALE', 'Current revision does not match the reviewable draft');
  }
  if (draft.contentHash !== input.expectedContentHash) {
    await recordBlockedReview(client, draft, reviewer.id, input.reviewNote, 'CONTENT_HASH_MISMATCH', draft.currentRevision.id);
    throw new EditorialReviewBlockedError('EDITORIAL_DRAFT_HASH_MISMATCH', 'Editorial draft changed after the human review started');
  }
  if (!hasValidDraftIntegrity(draft)) {
    await recordBlockedReview(client, draft, reviewer.id, input.reviewNote, 'DRAFT_INTEGRITY_MISMATCH', draft.currentRevision.id);
    throw new EditorialReviewBlockedError('EDITORIAL_DRAFT_INVALIDATED', 'Editorial draft content no longer matches the evaluated artifact');
  }
  const activeApproval = draft.currentRevision.reviewDecisions.find((item) => item.decisionType === 'APPROVE_DRAFT');
  const activeRejection = draft.currentRevision.reviewDecisions.find((item) => item.decisionType === 'REJECT_DRAFT');
  if (draft.articleId && activeApproval) return { draftId: draft.id, outcome: 'ALREADY_CREATED', articleId: draft.articleId };
  if (draft.qualityGate.humanReviewStatus === 'REJECTED' && activeRejection) return { draftId: draft.id, outcome: 'ALREADY_REJECTED', articleId: null };
  if (draft.qualityGate.humanReviewStatus !== 'PENDING') throw new Error('Editorial draft human review is already finalized');

  if (input.decision === 'REJECT') {
    const rejected = await client.$transaction(async (transaction) => {
      const claimed = await transaction.editorialQualityGate.updateMany({
        where: { id: draft.qualityGate!.id, humanReviewStatus: 'PENDING' },
        data: {
          humanReviewStatus: 'REJECTED',
          reviewedById: reviewer.id,
          reviewedAt: new Date(),
          reviewNote: input.reviewNote.trim(),
        },
      });
      if (claimed.count !== 1) {
        const current = await transaction.editorialQualityGate.findUnique({ where: { id: draft.qualityGate!.id }, select: { humanReviewStatus: true } });
        if (current?.humanReviewStatus === 'REJECTED') return false;
        throw new Error('Editorial draft human review was decided concurrently');
      }
      await transaction.editorialDraft.update({ where: { id: draft.id }, data: { status: 'HUMAN_REJECTED' } });
      await transaction.editorialDraftRevision.update({
        where: { id: draft.currentRevision!.id },
        data: { status: 'REJECTED' },
      });
      await transaction.editorialReviewDecision.create({
        data: {
          draftId: draft.id,
          revisionId: draft.currentRevision!.id,
          adminUserId: reviewer.id,
          decisionType: 'REJECT_DRAFT',
          contentHash: draft.contentHash!,
          note: input.reviewNote.trim(),
        },
      });
      await transaction.editorialReviewAuditLog.create({
        data: {
          draftId: draft.id,
          revisionId: draft.currentRevision!.id,
          actorUserId: reviewer.id,
          action: 'DRAFT_REJECTED',
          contentHash: draft.contentHash!,
          previousStatus: draft.status,
          resultingStatus: 'HUMAN_REJECTED',
          reviewNote: input.reviewNote.trim(),
          details: { decision: 'REJECT_DRAFT', reviewPolicy: 'versioned-four-eyes-v1' },
        },
      });
      return true;
    });
    return { draftId: draft.id, outcome: rejected ? 'REJECTED' : 'ALREADY_REJECTED', articleId: null };
  }

  if (draft.status !== 'READY_FOR_REVIEW' || draft.qualityGate.automatedDecision !== 'PASSED') {
    await recordBlockedReview(client, draft, reviewer.id, input.reviewNote, 'AUTOMATED_GATE_NOT_PASSED', draft.currentRevision.id);
    throw new EditorialReviewBlockedError('EDITORIAL_GATE_NOT_PASSED', 'Editorial quality gate must pass before human approval can create an Article DRAFT');
  }
  if (draft.qualityGate.gateVersion !== EDITORIAL_QUALITY_GATE_VERSION) {
    await recordBlockedReview(client, draft, reviewer.id, input.reviewNote, 'GATE_VERSION_STALE', draft.currentRevision.id);
    throw new EditorialReviewBlockedError('EDITORIAL_GATE_VERSION_STALE', 'Editorial quality gate must be recalculated with the current policy');
  }
  if (draft.qualityGate.evaluatedContentHash !== draft.contentHash) {
    await recordBlockedReview(client, draft, reviewer.id, input.reviewNote, 'GATE_CONTENT_HASH_MISMATCH', draft.currentRevision.id);
    throw new EditorialReviewBlockedError('EDITORIAL_GATE_STALE', 'Editorial quality gate does not match the current draft');
  }
  const title = draft.title;
  const summary = draft.summary;
  const contentHtml = draft.contentHtml;
  const contentHash = draft.contentHash;
  let validatedSources: ReturnType<typeof collectValidatedArticleSources>;
  try {
    validatedSources = collectValidatedArticleSources(draft);
  } catch (error) {
    await recordBlockedReview(client, draft, reviewer.id, input.reviewNote, error instanceof Error ? error.message : 'SOURCE_MATERIALIZATION_BLOCKED', draft.currentRevision.id);
    throw error;
  }
  const categoryId = draft.brief.dossier.candidate.topic.dominantCategoryId;
  const category = categoryId
    ? await client.category.findUnique({ where: { id: categoryId }, select: { id: true } })
    : null;
  const publicStructuredContent = editorialDraftArtifactToStructuredArticle(
    draft.structuredContent as unknown as EditorialDraftArtifact,
    {
      evidence: collectStructuredEvidence(draft),
      claimVerdicts: Object.fromEntries(draft.claims.map((claim) => [claim.claimKey, claim.verdict])),
    },
  );
  return client.$transaction(async (transaction) => {
    const claimed = await transaction.editorialQualityGate.updateMany({
      where: {
        id: draft.qualityGate!.id,
        automatedDecision: 'PASSED',
        humanReviewStatus: 'PENDING',
      },
      data: {
        humanReviewStatus: 'APPROVED',
        reviewedById: reviewer.id,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote.trim(),
      },
    });
    if (claimed.count !== 1) {
      const current = await transaction.editorialDraft.findUnique({
        where: { id: draft.id },
        select: {
          articleId: true,
          contentHash: true,
          currentRevisionId: true,
          currentRevision: {
            select: {
              reviewDecisions: {
                where: { active: true, decisionType: 'APPROVE_DRAFT' },
                select: { contentHash: true },
              },
            },
          },
        },
      });
      const concurrentApproval = current?.currentRevision?.reviewDecisions.some((decision) => decision.contentHash === contentHash);
      if (
        current?.articleId
        && current.contentHash === contentHash
        && current.currentRevisionId === draft.currentRevision!.id
        && concurrentApproval
      ) {
        return { draftId: draft.id, outcome: 'ALREADY_CREATED' as const, articleId: current.articleId };
      }
      throw new Error('Editorial draft human review was decided concurrently');
    }
    if (draft.article && draft.article.status !== 'DRAFT') {
      throw new EditorialReviewBlockedError('EDITORIAL_ARTICLE_NOT_DRAFT', 'Only an Article DRAFT may be refreshed from an editorial revision');
    }
    const articleData: Prisma.ArticleUncheckedCreateInput = {
        slug: buildAutomaticDraftSlug(title, draft.id),
        title: sanitizeArticleHtml(title),
        summary: sanitizeArticleHtml(summary),
        content: sanitizeArticleHtml(contentHtml),
        structuredContent: {
          ...publicStructuredContent,
          origin: 'EPION_AUTOMATIC_EDITORIAL',
          editorialDraftId: draft.id,
          editorialRevisionId: draft.currentRevision!.id,
          editorialRevisionVersion: draft.currentRevision!.version,
          editorialBriefId: draft.briefId,
          contentHash,
        } as unknown as Prisma.InputJsonValue,
        status: 'DRAFT',
        authorId: null,
        categoryId: category?.id ?? null,
        generatedAt: draft.generatedAt,
        generationVersion: 1,
        generationConfig: {
          origin: 'EPION_AUTOMATIC_EDITORIAL',
          editorialDraftId: draft.id,
          editorialRevisionId: draft.currentRevision!.id,
          editorialBriefId: draft.briefId,
          draftApproverId: reviewer.id,
          automaticPublicationAllowed: false,
          publicationAuthorized: false,
        },
        factCheckStatus: 'PENDING',
        factCheckScore: null,
        factCheckData: Prisma.JsonNull,
        factCheckContentHash: null,
        factCheckStartedAt: null,
        factCheckCompletedAt: null,
        factCheckError: null,
      };
    const article = draft.articleId
      ? await transaction.article.update({
        where: { id: draft.articleId },
        data: {
          title: articleData.title,
          summary: articleData.summary,
          content: articleData.content,
          structuredContent: articleData.structuredContent,
          status: 'DRAFT',
          authorId: null,
          categoryId: articleData.categoryId,
          generatedAt: articleData.generatedAt,
          generationVersion: { increment: 1 },
          generationConfig: articleData.generationConfig,
          factCheckStatus: 'PENDING',
          factCheckScore: null,
          factCheckData: Prisma.JsonNull,
          factCheckContentHash: null,
          factCheckStartedAt: null,
          factCheckCompletedAt: null,
          factCheckError: null,
        },
        select: { id: true },
      })
      : await transaction.article.create({ data: articleData, select: { id: true } });
    if (draft.articleId) await transaction.articleSource.deleteMany({ where: { articleId: article.id } });
    for (const source of validatedSources) {
      const upsert = buildArticleSourceUpsertInput({
        articleId: article.id,
        durableSourceId: source.sourceId,
        sourceUrl: source.sourceUrl,
        role: source.role,
        supportStrength: source.supportStrength,
        provenance: 'EDITORIAL',
        profileSnapshot: source.profileSnapshot,
        profileVersion: source.profileVersion,
        snapshotAt: source.snapshotAt,
        position: source.position,
      });
      if (!upsert) throw new EditorialReviewBlockedError('EDITORIAL_SOURCE_INVALID', 'Validated editorial source could not be materialized');
      await transaction.articleSource.upsert(upsert);
    }
    const now = new Date();
    await transaction.editorialDraft.update({
      where: { id: draft.id },
      data: { status: 'ARTICLE_DRAFT_CREATED', articleId: article.id },
    });
    await transaction.editorialQualityGate.update({
      where: { id: draft.qualityGate!.id },
      data: { articleCreatedAt: now },
    });
    await transaction.editorialDraftRevision.update({
      where: { id: draft.currentRevision!.id },
      data: { status: 'APPROVED', approvedAt: now },
    });
    await transaction.editorialReviewDecision.create({
      data: {
        draftId: draft.id,
        revisionId: draft.currentRevision!.id,
        adminUserId: reviewer.id,
        decisionType: 'APPROVE_DRAFT',
        contentHash,
        note: input.reviewNote.trim(),
      },
    });
    await transaction.editorialReviewAuditLog.create({
      data: {
        draftId: draft.id,
        revisionId: draft.currentRevision!.id,
        actorUserId: reviewer.id,
        action: 'DRAFT_APPROVED',
        contentHash,
        previousStatus: draft.status,
        resultingStatus: 'ARTICLE_DRAFT_CREATED',
        articleId: article.id,
        reviewNote: input.reviewNote.trim(),
        details: {
          decision: 'APPROVE_DRAFT',
          reviewPolicy: 'versioned-four-eyes-v1',
          materializedArticleSources: validatedSources.length,
          automaticPublicationAllowed: false,
        },
      },
    });
    return { draftId: draft.id, outcome: 'ARTICLE_DRAFT_CREATED' as const, articleId: article.id };
  });
}

interface ValidatedArticleSource {
  sourceId: string;
  sourceUrl: string;
  role: 'PRIMARY_EVIDENCE' | 'CONTEXT';
  supportStrength: 'STRONG' | 'MODERATE';
  profileSnapshot: ReturnType<typeof buildArticleSourceProfileSnapshot>;
  profileVersion: number | null;
  snapshotAt: Date;
  position: number;
}

function collectStructuredEvidence(draft: any) {
  const byKey = new Map<string, {
    evidenceKey: string;
    url: string;
    title: string | null;
    domain: string;
  }>();
  for (const claim of draft.claims as any[]) {
    for (const citation of claim.evidence as any[]) {
      const proof = citation.briefEvidence;
      if (byKey.has(proof.evidenceKey)) continue;
      const url = normalizeArticleSourceUrl(proof.canonicalUrl);
      if (!url) continue;
      byKey.set(proof.evidenceKey, {
        evidenceKey: proof.evidenceKey,
        url,
        title: proof.documentTitle ?? null,
        domain: proof.domain,
      });
    }
  }
  return [...byKey.values()];
}

function collectValidatedArticleSources(draft: any): ValidatedArticleSource[] {
  const snapshotAt = new Date();
  const byUrl = new Map<string, ValidatedArticleSource>();
  for (const claim of draft.claims as any[]) {
    const confirmedEvidence = (claim.evidence as any[]).filter((citation) => citation.criticConfirmed === true);
    if (!confirmedEvidence.length) {
      throw new EditorialReviewBlockedError('EDITORIAL_CLAIM_WITHOUT_VALIDATED_SOURCE', `Claim ${claim.claimKey} has no critic-confirmed source`);
    }
    for (const citation of confirmedEvidence) {
      const proof = citation.briefEvidence;
      const source = proof.document.source;
      if (!source?.id) {
        throw new EditorialReviewBlockedError('EDITORIAL_SOURCE_IDENTITY_MISSING', `Validated evidence ${proof.evidenceKey} has no durable Source identity`);
      }
      const sourceUrl = normalizeArticleSourceUrl(proof.canonicalUrl);
      if (!sourceUrl) throw new EditorialReviewBlockedError('EDITORIAL_SOURCE_URL_INVALID', `Validated evidence ${proof.evidenceKey} has an invalid canonical URL`);
      const proofDomain = String(proof.domain || '').toLowerCase().replace(/^www\./, '');
      const urlDomain = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, '');
      const durableDomain = String(source.domain || '').toLowerCase().replace(/^www\./, '');
      if (!proofDomain || proofDomain !== urlDomain || durableDomain !== urlDomain) {
        throw new EditorialReviewBlockedError('EDITORIAL_SOURCE_DOMAIN_MISMATCH', `Validated evidence ${proof.evidenceKey} has inconsistent source identity`);
      }
      const candidate: ValidatedArticleSource = {
        sourceId: source.id,
        sourceUrl,
        role: proof.role === 'PRIMARY' ? 'PRIMARY_EVIDENCE' : 'CONTEXT',
        supportStrength: claim.verdict === 'SUPPORTED' ? 'STRONG' : 'MODERATE',
        profileSnapshot: buildArticleSourceProfileSnapshot({
          profileData: source.profileData,
          profileConfidence: source.profileConfidence,
          publicTrustLabel: source.publicTrustLabel,
          lastProfiledAt: source.lastProfiledAt,
          snapshotAt,
          sourceUrl,
          contentTitle: proof.documentTitle,
        }),
        profileVersion: source.profileVersion,
        snapshotAt,
        position: proof.position,
      };
      const existing = byUrl.get(sourceUrl);
      if (existing && existing.sourceId !== candidate.sourceId) {
        throw new EditorialReviewBlockedError('EDITORIAL_SOURCE_IDENTITY_CONFLICT', `Validated source URL ${sourceUrl} maps to conflicting Source identities`);
      }
      if (!existing) {
        byUrl.set(sourceUrl, candidate);
      } else {
        existing.position = Math.min(existing.position, candidate.position);
        if (candidate.role === 'PRIMARY_EVIDENCE') existing.role = 'PRIMARY_EVIDENCE';
        if (candidate.supportStrength === 'STRONG') existing.supportStrength = 'STRONG';
      }
    }
  }
  const sources = [...byUrl.values()].sort((left, right) => left.position - right.position || left.sourceUrl.localeCompare(right.sourceUrl));
  if (!sources.length) throw new EditorialReviewBlockedError('EDITORIAL_VALIDATED_SOURCES_EMPTY', 'No critic-confirmed source can be materialized');
  return sources.map((source, position) => ({ ...source, position }));
}

function hasValidDraftIntegrity(draft: any): boolean {
  const artifact = draft.structuredContent as any;
  if (!artifact || typeof artifact !== 'object') return false;
  if (artifact.title !== draft.title || artifact.summary !== draft.summary) return false;
  try {
    return hashEditorialDraftArtifact(artifact) === draft.contentHash && renderEditorialDraftHtml(artifact) === draft.contentHtml;
  } catch {
    return false;
  }
}

async function recordBlockedReview(
  client: PrismaClient,
  draft: { id: string; contentHash: string | null; status: EditorialDraftStatus },
  actorUserId: string,
  reviewNote: string,
  reason: string,
  revisionId?: string,
): Promise<void> {
  if (!draft.contentHash) return;
  await client.editorialReviewAuditLog.create({
    data: {
      draftId: draft.id,
      revisionId,
      actorUserId,
      action: 'APPROVAL_BLOCKED',
      contentHash: draft.contentHash,
      previousStatus: draft.status,
      resultingStatus: draft.status,
      reviewNote: reviewNote.trim(),
      details: { reason },
    },
  });
}

export function buildAutomaticDraftSlug(title: string, draftId: string): string {
  const base = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'article';
  const suffix = draftId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'editorial';
  return `${base.slice(0, Math.max(1, 63 - suffix.length))}-${suffix}`;
}
