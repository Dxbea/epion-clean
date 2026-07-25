import { Prisma, type PrismaClient } from '@prisma/client';
import {
  buildArticleSourceProfileSnapshot,
  buildArticleSourceUpsertInput,
  normalizeArticleSourceUrl,
} from '../article-source-service.js';
import { sanitizeArticleHtml } from '../sanitizeHtml.js';
import { normalizeSourceDomain } from '../source-profile.js';
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
  if (!draft.currentRevision || !draft.qualityGate || !draft.contentHash || !draft.title || !draft.summary || !draft.contentHtml || !draft.structuredContent) {
    throw new Error('Quality-gate validation requires a complete editorial draft artifact');
  }
  const qualityGate = draft.qualityGate;
  const validNewDraft = !draft.article && draft.status === 'READY_FOR_REVIEW';
  const validExistingDraft = draft.article?.status === 'DRAFT' && draft.status === 'ARTICLE_DRAFT_CREATED';
  if ((!validNewDraft && !validExistingDraft) || draft.currentRevision.status !== 'GATE_PASSED' || draft.qualityGate.automatedDecision !== 'PASSED') {
    throw new Error(`Quality-gate validation cannot materialize draft: ${draft.qualityGate.automatedDecision}`);
  }
  if (draft.currentRevision.contentHash !== draft.contentHash || draft.qualityGate.gateVersion !== EDITORIAL_QUALITY_GATE_VERSION || draft.qualityGate.evaluatedContentHash !== draft.contentHash) {
    throw new Error('Quality-gate validation requires a current evaluated content hash');
  }
  const artifact = draft.structuredContent as unknown as EditorialDraftArtifact;
  const materializedSources = collectMaterializedSources(draft);
  const publicStructuredContent = editorialDraftArtifactToStructuredArticle(artifact, {
    evidence: materializedSources,
    claimVerdicts: Object.fromEntries(draft.claims.map((claim) => [claim.claimKey, claim.verdict])),
  });
  const structuredContent = {
    ...publicStructuredContent,
    origin: 'EPION_AUTOMATIC_EDITORIAL',
    editorialDraftId: draft.id,
    editorialRevisionId: draft.currentRevision.id,
    editorialRevisionVersion: draft.currentRevision.version,
    editorialBriefId: draft.briefId,
    contentHash: draft.contentHash,
  } as unknown as Prisma.InputJsonValue;
  if (draft.article) {
    await client.$transaction(async (transaction) => {
      await upsertMaterializedSources(transaction, draft.article!.id, materializedSources);
      await transaction.article.update({ where: { id: draft.article!.id }, data: { structuredContent } });
    });
    return { draftId: draft.id, articleId: draft.article.id, outcome: 'ALREADY_CREATED' };
  }
  const articleData: Prisma.ArticleUncheckedCreateInput = {
    slug: buildAutomaticDraftSlug(draft.title, draft.id),
    title: sanitizeArticleHtml(draft.title),
    summary: sanitizeArticleHtml(draft.summary),
    content: sanitizeArticleHtml(draft.contentHtml),
    structuredContent,
    status: 'DRAFT',
    authorId: null,
    categoryId: draft.brief.dossier.candidate?.topic?.dominantCategoryId ?? null,
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
    await upsertMaterializedSources(transaction, article.id, materializedSources);
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

async function upsertMaterializedSources(transaction: any, articleId: string, sources: MaterializedEditorialSource[]): Promise<void> {
  for (const source of sources) {
    const upsert = buildArticleSourceUpsertInput({
      articleId,
      durableSourceId: source.sourceId,
      sourceUrl: source.url,
      role: source.role,
      supportStrength: source.supportStrength,
      provenance: 'EDITORIAL',
      profileSnapshot: source.profileSnapshot,
      profileVersion: source.profileVersion,
      snapshotAt: source.snapshotAt,
      position: source.position,
    });
    if (!upsert) throw new Error(`Quality-gate Article DRAFT source mapping is invalid: ${source.evidenceKey}`);
    await transaction.articleSource.upsert(upsert);
  }
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
      currentRevision: { select: { id: true, version: true, status: true, contentHash: true } },
      qualityGate: { select: { id: true, gateVersion: true, evaluatedContentHash: true, automatedDecision: true } },
      article: { select: { id: true, status: true } },
      brief: {
        select: {
          dossier: {
            select: {
              evidence: {
                orderBy: { position: 'asc' },
                select: {
                  id: true,
                  evidenceKey: true,
                  role: true,
                  position: true,
                  canonicalUrl: true,
                  documentTitle: true,
                  domain: true,
                  document: {
                    select: {
                      canonicalUrl: true,
                      url: true,
                      sourceId: true,
                      source: {
                        select: {
                          id: true,
                          domain: true,
                          name: true,
                          trustScore: true,
                          reliability: true,
                          profileData: true,
                          profileVersion: true,
                          profileConfidence: true,
                          lastProfiledAt: true,
                          publicTrustLabel: true,
                        },
                      },
                    },
                  },
                },
              },
              candidate: {
                select: {
                  topic: { select: { dominantCategoryId: true } },
                },
              },
            },
          },
        },
      },
      claims: {
        select: {
          claimKey: true,
          verdict: true,
          evidence: {
            where: { criticConfirmed: true },
            orderBy: { citationOrder: 'asc' },
            select: {
              citationOrder: true,
              briefEvidence: {
                select: {
                  id: true,
                  evidenceKey: true,
                  role: true,
                  position: true,
                  canonicalUrl: true,
                  documentTitle: true,
                  domain: true,
                  document: {
                    select: {
                      canonicalUrl: true,
                      url: true,
                      sourceId: true,
                      source: {
                        select: {
                          id: true,
                          domain: true,
                          name: true,
                          trustScore: true,
                          reliability: true,
                          profileData: true,
                          profileVersion: true,
                          profileConfidence: true,
                          lastProfiledAt: true,
                          publicTrustLabel: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

interface MaterializedEditorialSource {
  evidenceKey: string;
  url: string;
  title: string | null;
  domain: string;
  sourceId: string;
  role: 'PRIMARY_EVIDENCE' | 'CONTEXT';
  supportStrength: 'STRONG' | 'MODERATE';
  profileSnapshot: ReturnType<typeof buildArticleSourceProfileSnapshot>;
  profileVersion: number | null;
  snapshotAt: Date;
  position: number;
}

function collectMaterializedSources(draft: any): MaterializedEditorialSource[] {
  const citedEvidenceKeys = new Set<string>();
  const citedProofs: any[] = [];
  for (const claim of (draft.claims as any[] ?? [])) {
    for (const citation of claim.evidence as any[] ?? []) {
      const proof = citation.briefEvidence;
      if (!proof) continue;
      if (proof.evidenceKey) citedEvidenceKeys.add(proof.evidenceKey);
      citedProofs.push({ ...proof, citationOrder: citation.citationOrder });
    }
  }
  const byUrl = new Map<string, MaterializedEditorialSource>();
  const snapshotAt = new Date();
  const evidenceById = new Map<string, any>();
  for (const proof of draft.brief?.dossier?.evidence as any[] ?? []) {
    if (proof.id) evidenceById.set(proof.id, proof);
  }
  const evidence = [
    ...(draft.brief?.dossier?.evidence as any[] ?? []).filter((proof) => proof.role === 'PRIMARY' || citedEvidenceKeys.has(proof.evidenceKey)),
    ...citedProofs.filter((proof) => !proof.id || !evidenceById.has(proof.id)),
  ];

  for (const proof of evidence) {
    const isPrimary = proof.role === 'PRIMARY';
    const isCited = citedEvidenceKeys.has(proof.evidenceKey);
    if (!isPrimary && !isCited) continue;

    const source = proof.document?.source;
    const sourceId = proof.document?.sourceId ?? null;
    const url = normalizeArticleSourceUrl(
      proof.canonicalUrl ?? proof.document?.canonicalUrl ?? proof.document?.url,
    );
    const proofDomain = normalizeSourceDomain(proof.domain);
    const urlDomain = normalizeSourceDomain(url);
    const durableDomain = normalizeSourceDomain(source?.domain);
    if (!url || !proofDomain || !urlDomain || proofDomain !== urlDomain || (durableDomain && durableDomain !== urlDomain)) {
      throw new Error(`Quality-gate Article DRAFT source mapping is inconsistent: ${proof.evidenceKey}`);
    }
    if (!sourceId) {
      if (isPrimary) throw new Error(`Quality-gate Article DRAFT primary source has no durable identity: ${proof.evidenceKey}`);
      continue;
    }

    const profileSnapshot = buildArticleSourceProfileSnapshot({
      profileData: source?.profileData,
      profileConfidence: source?.profileConfidence,
      publicTrustLabel: source?.publicTrustLabel,
      lastProfiledAt: source?.lastProfiledAt,
      snapshotAt,
      sourceUrl: url,
      contentTitle: proof.documentTitle,
    });
    const candidate: MaterializedEditorialSource = {
      evidenceKey: proof.evidenceKey,
      url,
      title: proof.documentTitle ?? null,
      domain: urlDomain,
      sourceId,
      role: isPrimary ? 'PRIMARY_EVIDENCE' : 'CONTEXT',
      supportStrength: isCited ? 'STRONG' : 'MODERATE',
      profileSnapshot: {
        ...profileSnapshot,
        sourceMetadata: {
          domain: source?.domain ?? null,
          name: source?.name ?? null,
          trustScore: Number.isFinite(source?.trustScore) ? source.trustScore : null,
          reliability: typeof source?.reliability === 'string' ? source.reliability : null,
          profileVersion: Number.isInteger(source?.profileVersion) ? source.profileVersion : null,
        },
      },
      profileVersion: Number.isInteger(source?.profileVersion) ? source.profileVersion : null,
      snapshotAt,
      position: Number.isInteger(proof.position)
        ? proof.position
        : Number.isInteger(proof.citationOrder) ? proof.citationOrder : Number.MAX_SAFE_INTEGER,
    };
    const existing = byUrl.get(url);
    if (!existing) {
      byUrl.set(url, candidate);
      continue;
    }
    if (existing.sourceId !== candidate.sourceId) throw new Error(`Quality-gate Article DRAFT source identity conflict: ${url}`);
    existing.position = Math.min(existing.position, candidate.position);
    if (candidate.role === 'PRIMARY_EVIDENCE') existing.role = candidate.role;
    if (candidate.supportStrength === 'STRONG') existing.supportStrength = candidate.supportStrength;
  }

  const sources = [...byUrl.values()].sort((left, right) => left.position - right.position || left.url.localeCompare(right.url));
  if (!sources.length) throw new Error('ArticleSource repair did not materialize any source');
  return sources.map((source, position) => ({ ...source, position }));
}

function buildAutomaticDraftSlug(title: string, draftId: string): string {
  const base = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'article';
  const suffix = draftId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'editorial';
  return `${base.slice(0, Math.max(1, 63 - suffix.length))}-${suffix}`;
}
