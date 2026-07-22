import { Prisma, type PrismaClient } from '@prisma/client';
import { normalizeArticleSourceUrl } from '../article-source-service.js';
import { sanitizeArticleHtml } from '../sanitizeHtml.js';
import { editorialDraftArtifactToStructuredArticle } from './structured-article-adapter.js';
import { EDITORIAL_QUALITY_GATE_VERSION, type EditorialDraftArtifact } from './types.js';

export interface QualityGateArticleMaterializationResult {
  draftId: string;
  articleId: string;
  outcome: 'ARTICLE_DRAFT_CREATED' | 'ALREADY_CREATED';
}

export async function materializeQualityGateArticleDraft(
  client: PrismaClient,
  draftId: string,
): Promise<QualityGateArticleMaterializationResult> {
  const draft = await loadMaterializableDraft(client, draftId);
  if (!draft) throw new Error('Editorial draft not found for quality-gate validation');
  if (draft.article) {
    if (draft.article.status !== 'DRAFT') throw new Error('Quality-gate validation only materializes an Article DRAFT');
    return { draftId: draft.id, articleId: draft.article.id, outcome: 'ALREADY_CREATED' };
  }
  if (!draft.currentRevision || !draft.qualityGate || !draft.contentHash || !draft.title || !draft.summary || !draft.contentHtml || !draft.structuredContent) {
    throw new Error('Quality-gate validation requires a complete editorial draft artifact');
  }
  const qualityGate = draft.qualityGate;
  if (draft.status !== 'READY_FOR_REVIEW' || draft.qualityGate.automatedDecision !== 'PASSED') {
    throw new Error(`Quality-gate validation cannot materialize draft: ${draft.qualityGate.automatedDecision}`);
  }
  if (draft.qualityGate.gateVersion !== EDITORIAL_QUALITY_GATE_VERSION || draft.qualityGate.evaluatedContentHash !== draft.contentHash) {
    throw new Error('Quality-gate validation requires a current evaluated content hash');
  }
  const artifact = draft.structuredContent as unknown as EditorialDraftArtifact;
  const publicStructuredContent = editorialDraftArtifactToStructuredArticle(artifact, {
    evidence: collectStructuredEvidence(draft),
    claimVerdicts: Object.fromEntries(draft.claims.map((claim) => [claim.claimKey, claim.verdict])),
  });
  const articleData: Prisma.ArticleUncheckedCreateInput = {
    slug: buildAutomaticDraftSlug(draft.title, draft.id),
    title: sanitizeArticleHtml(draft.title),
    summary: sanitizeArticleHtml(draft.summary),
    content: sanitizeArticleHtml(draft.contentHtml),
    structuredContent: {
      ...publicStructuredContent,
      origin: 'EPION_AUTOMATIC_EDITORIAL',
      editorialDraftId: draft.id,
      editorialRevisionId: draft.currentRevision.id,
      editorialRevisionVersion: draft.currentRevision.version,
      editorialBriefId: draft.briefId,
      contentHash: draft.contentHash,
    } as unknown as Prisma.InputJsonValue,
    status: 'DRAFT',
    authorId: null,
    categoryId: null,
    generatedAt: draft.generatedAt,
    generationVersion: 1,
    generationConfig: {
      origin: 'EPION_AUTOMATIC_EDITORIAL',
      editorialDraftId: draft.id,
      editorialRevisionId: draft.currentRevision.id,
      editorialBriefId: draft.briefId,
      validationMode: 'quality_gate',
      automaticValidation: 'QUALITY_GATE_PASSED',
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

  return client.$transaction(async (transaction) => {
    const article = await transaction.article.create({ data: articleData, select: { id: true } });
    const claimed = await transaction.editorialDraft.updateMany({
      where: { id: draft.id, articleId: null, status: 'READY_FOR_REVIEW', contentHash: draft.contentHash },
      data: { status: 'ARTICLE_DRAFT_CREATED', articleId: article.id },
    });
    if (claimed.count !== 1) throw new Error('Quality-gate Article DRAFT materialization conflicted with another transition');
    await transaction.editorialQualityGate.update({
      where: { id: qualityGate.id },
      data: { articleCreatedAt: new Date() },
    });
    return { draftId: draft.id, articleId: article.id, outcome: 'ARTICLE_DRAFT_CREATED' as const };
  });
}

async function loadMaterializableDraft(client: PrismaClient, draftId: string) {
  return client.editorialDraft.findUnique({
    where: { id: draftId },
    select: {
      id: true,
      briefId: true,
      status: true,
      title: true,
      summary: true,
      contentHtml: true,
      contentHash: true,
      structuredContent: true,
      generatedAt: true,
      currentRevision: { select: { id: true, version: true, contentHash: true } },
      qualityGate: { select: { id: true, gateVersion: true, evaluatedContentHash: true, automatedDecision: true } },
      article: { select: { id: true, status: true } },
      claims: {
        select: {
          claimKey: true,
          verdict: true,
          evidence: {
            where: { criticConfirmed: true },
            select: { briefEvidence: { select: { evidenceKey: true, canonicalUrl: true, documentTitle: true, domain: true } } },
          },
        },
      },
    },
  });
}

function collectStructuredEvidence(draft: any) {
  const byKey = new Map<string, { evidenceKey: string; url: string; title: string | null; domain: string }>();
  for (const claim of draft.claims as any[]) {
    for (const citation of claim.evidence as any[]) {
      const proof = citation.briefEvidence;
      const url = normalizeArticleSourceUrl(proof.canonicalUrl);
      if (!url || byKey.has(proof.evidenceKey)) continue;
      byKey.set(proof.evidenceKey, { evidenceKey: proof.evidenceKey, url, title: proof.documentTitle ?? null, domain: proof.domain });
    }
  }
  return [...byKey.values()];
}

function buildAutomaticDraftSlug(title: string, draftId: string): string {
  const base = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'article';
  const suffix = draftId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'editorial';
  return `${base.slice(0, Math.max(1, 63 - suffix.length))}-${suffix}`;
}
