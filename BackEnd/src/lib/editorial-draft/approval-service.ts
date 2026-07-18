import { Prisma, type PrismaClient } from '@prisma/client';
import { sanitizeArticleHtml } from '../sanitizeHtml.js';

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
      qualityGate: true,
      brief: { include: { dossier: { include: { candidate: { include: { topic: true } } } } } },
    },
  });
  if (!draft || !draft.qualityGate || !draft.contentHash || !draft.title || !draft.summary || !draft.contentHtml || !draft.structuredContent) {
    throw new Error('Editorial draft is not reviewable');
  }
  if (draft.contentHash !== input.expectedContentHash) throw new Error('Editorial draft changed after the human review started');
  if (draft.articleId) return { draftId: draft.id, outcome: 'ALREADY_CREATED', articleId: draft.articleId };
  if (draft.qualityGate.humanReviewStatus === 'REJECTED') return { draftId: draft.id, outcome: 'ALREADY_REJECTED', articleId: null };
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
      return true;
    });
    return { draftId: draft.id, outcome: rejected ? 'REJECTED' : 'ALREADY_REJECTED', articleId: null };
  }

  if (draft.status !== 'READY_FOR_REVIEW' || draft.qualityGate.automatedDecision !== 'PASSED') {
    throw new Error('Editorial quality gate must pass before human approval can create an Article DRAFT');
  }
  const title = draft.title;
  const summary = draft.summary;
  const contentHtml = draft.contentHtml;
  const contentHash = draft.contentHash;
  const categoryId = draft.brief.dossier.candidate.topic.dominantCategoryId;
  const category = categoryId
    ? await client.category.findUnique({ where: { id: categoryId }, select: { id: true } })
    : null;
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
      const current = await transaction.editorialDraft.findUnique({ where: { id: draft.id }, select: { articleId: true } });
      if (current?.articleId) return { draftId: draft.id, outcome: 'ALREADY_CREATED' as const, articleId: current.articleId };
      throw new Error('Editorial draft human review was decided concurrently');
    }
    const article = await transaction.article.create({
      data: {
        slug: buildAutomaticDraftSlug(title, draft.id),
        title: sanitizeArticleHtml(title),
        summary: sanitizeArticleHtml(summary),
        content: sanitizeArticleHtml(contentHtml),
        structuredContent: {
          origin: 'EPION_AUTOMATIC_EDITORIAL',
          editorialDraftId: draft.id,
          editorialBriefId: draft.briefId,
          contentHash,
          artifact: draft.structuredContent,
        } as Prisma.InputJsonValue,
        status: 'DRAFT',
        authorId: null,
        categoryId: category?.id ?? null,
        generatedAt: draft.generatedAt,
        generationVersion: 1,
        generationConfig: {
          origin: 'EPION_AUTOMATIC_EDITORIAL',
          editorialDraftId: draft.id,
          editorialBriefId: draft.briefId,
          humanReviewerId: reviewer.id,
          automaticPublicationAllowed: false,
        },
      },
      select: { id: true },
    });
    const now = new Date();
    await transaction.editorialDraft.update({
      where: { id: draft.id },
      data: { status: 'ARTICLE_DRAFT_CREATED', articleId: article.id },
    });
    await transaction.editorialQualityGate.update({
      where: { id: draft.qualityGate!.id },
      data: { articleCreatedAt: now },
    });
    return { draftId: draft.id, outcome: 'ARTICLE_DRAFT_CREATED' as const, articleId: article.id };
  });
}

export function buildAutomaticDraftSlug(title: string, draftId: string): string {
  const base = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'article';
  const suffix = draftId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'editorial';
  return `${base.slice(0, Math.max(1, 63 - suffix.length))}-${suffix}`;
}
