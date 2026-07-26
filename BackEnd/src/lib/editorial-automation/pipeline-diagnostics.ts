import type { PrismaClient } from '@prisma/client';

export interface EditorialPipelineDiagnostics {
  stages: {
    topics: number;
    candidatesProposed: number;
    candidatesSuppressed: number;
    dossiers: number;
    briefs: number;
    drafts: number;
    verifications: number;
    publishedArticles: number;
  };
  dossiers: Array<{
    id: string;
    status: string;
    error: string | null;
    selectedDocuments: number;
    selectedDomains: number;
    selectedChunks: number;
    briefId: string | null;
  }>;
  drafts: Array<{
    id: string;
    status: string;
    error: string | null;
    qualityGateDecision: string | null;
    qualityGateReasons: string[];
    currentRevisionStatus: string | null;
    articleId: string | null;
    articleStatus: string | null;
    articleSources: number;
    articleSourceDomains: number;
    factCheckStatus: string | null;
    factCheckScore: number | null;
    categoryId: string | null;
    verificationId: string | null;
    verificationStatus: string | null;
    verificationReasons: string[];
    verificationError: string | null;
  }>;
  blockingReasons: Array<{ code: string; detail: Record<string, unknown> }>;
  validated: boolean;
}

export async function collectEditorialPipelineDiagnostics(
  client: PrismaClient,
  input: { windowStart: Date; windowEnd: Date },
): Promise<EditorialPipelineDiagnostics> {
  const [topics, dossiers, drafts] = await Promise.all([
    client.editorialTopic.findMany({
      where: { run: { windowStart: input.windowStart, windowEnd: input.windowEnd } },
      select: { candidate: { select: { status: true } } },
    }),
    client.editorialSourceDossier.findMany({
      where: {
        candidate: {
          topic: { run: { windowStart: input.windowStart, windowEnd: input.windowEnd } },
        },
      },
      select: {
        id: true,
        status: true,
        error: true,
        selectedDocumentCount: true,
        selectedDomainCount: true,
        selectedChunkCount: true,
        brief: { select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    client.editorialDraft.findMany({
      where: {
        brief: {
          dossier: {
            candidate: {
              topic: { run: { windowStart: input.windowStart, windowEnd: input.windowEnd } },
            },
          },
        },
      },
      select: {
        id: true,
        status: true,
        error: true,
        currentRevision: { select: { status: true } },
        qualityGate: { select: { automatedDecision: true, automatedReasons: true } },
        article: {
          select: {
            id: true,
            status: true,
            categoryId: true,
            factCheckStatus: true,
            factCheckScore: true,
            articleSources: {
              select: { source: { select: { domain: true } } },
            },
          },
        },
        verificationRuns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, gateReasons: true, error: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const draftDiagnostics = drafts.map((draft) => {
    const verification = draft.verificationRuns[0] ?? null;
    const domains = new Set((draft.article?.articleSources ?? [])
      .map((source) => source.source.domain?.trim().toLowerCase())
      .filter((domain): domain is string => Boolean(domain)));
    return {
      id: draft.id,
      status: draft.status,
      error: draft.error,
      qualityGateDecision: draft.qualityGate?.automatedDecision ?? null,
      qualityGateReasons: jsonStringArray(draft.qualityGate?.automatedReasons),
      currentRevisionStatus: draft.currentRevision?.status ?? null,
      articleId: draft.article?.id ?? null,
      articleStatus: draft.article?.status ?? null,
      articleSources: draft.article?.articleSources.length ?? 0,
      articleSourceDomains: domains.size,
      factCheckStatus: draft.article?.factCheckStatus ?? null,
      factCheckScore: draft.article?.factCheckScore ?? null,
      categoryId: draft.article?.categoryId ?? null,
      verificationId: verification?.id ?? null,
      verificationStatus: verification?.status ?? null,
      verificationReasons: jsonStringArray(verification?.gateReasons),
      verificationError: verification?.error ?? null,
    };
  });
  const blockingReasons: EditorialPipelineDiagnostics['blockingReasons'] = [];
  if (topics.length === 0) blockingReasons.push({ code: 'NO_TOPICS_CREATED', detail: {} });
  const proposed = topics.filter((topic) => topic.candidate?.status === 'SHADOW_PROPOSED').length;
  const suppressed = topics.filter((topic) => topic.candidate?.status === 'SHADOW_SUPPRESSED').length;
  if (topics.length > 0 && proposed === 0) {
    blockingReasons.push({
      code: 'NO_PROPOSED_CANDIDATES',
      detail: { topics: topics.length, suppressed },
    });
  }
  if (dossiers.length === 0) blockingReasons.push({ code: 'NO_SOURCE_DOSSIER', detail: {} });
  for (const dossier of dossiers) {
    if (dossier.status !== 'COMPLETED' || !dossier.brief) {
      blockingReasons.push({
        code: dossier.status === 'FAILED' ? 'SOURCE_DOSSIER_FAILED' : 'BRIEF_NOT_CREATED',
        detail: { dossierId: dossier.id, status: dossier.status, error: dossier.error },
      });
    }
  }
  if (dossiers.some((dossier) => dossier.brief) && drafts.length === 0) {
    blockingReasons.push({ code: 'DRAFT_NOT_CREATED', detail: {} });
  }
  for (const draft of draftDiagnostics) {
    if (draft.qualityGateDecision && draft.qualityGateDecision !== 'PASSED') {
      blockingReasons.push({
        code: 'QUALITY_GATE_NOT_PASSED',
        detail: { draftId: draft.id, decision: draft.qualityGateDecision, reasons: draft.qualityGateReasons },
      });
    }
    if (!draft.verificationId) {
      blockingReasons.push({ code: 'VERIFICATION_NOT_CREATED', detail: { draftId: draft.id, status: draft.status, error: draft.error } });
    } else if (draft.verificationStatus !== 'PASSED') {
      blockingReasons.push({
        code: 'VERIFICATION_NOT_PASSED',
        detail: {
          draftId: draft.id,
          verificationId: draft.verificationId,
          status: draft.verificationStatus,
          reasons: draft.verificationReasons,
          error: draft.verificationError,
        },
      });
    }
    if (draft.articleStatus !== 'PUBLISHED') {
      const publicationGateReasons = [
        ...(draft.articleSources < 2 ? ['ARTICLE_SOURCES_LT_2'] : []),
        ...(draft.articleSourceDomains < 2 ? ['INDEPENDENT_DOMAINS_LT_2'] : []),
        ...(draft.verificationStatus !== 'PASSED' ? ['VERIFICATION_NOT_PASSED'] : []),
        ...(draft.factCheckStatus !== 'COMPLETED' || typeof draft.factCheckScore !== 'number'
          ? ['FACT_SCORE_INCOMPLETE']
          : []),
        ...(!draft.categoryId ? ['CATEGORY_MISSING'] : []),
        ...(draft.qualityGateDecision !== 'PASSED' ? ['QUALITY_GATE_NOT_PASSED'] : []),
      ];
      if (publicationGateReasons.length > 0) {
        blockingReasons.push({
          code: 'PUBLICATION_GATE_BLOCKED',
          detail: { draftId: draft.id, articleId: draft.articleId, reasons: publicationGateReasons },
        });
      } else {
        blockingReasons.push({
          code: 'ARTICLE_NOT_PUBLISHED_DESPITE_PASSED_GATES',
          detail: { draftId: draft.id, articleId: draft.articleId },
        });
      }
    }
  }

  const publishedArticles = draftDiagnostics.filter((draft) => draft.articleStatus === 'PUBLISHED').length;
  const stages = {
    topics: topics.length,
    candidatesProposed: proposed,
    candidatesSuppressed: suppressed,
    dossiers: dossiers.length,
    briefs: dossiers.filter((dossier) => dossier.brief).length,
    drafts: drafts.length,
    verifications: draftDiagnostics.filter((draft) => draft.verificationId).length,
    publishedArticles,
  };
  return {
    stages,
    dossiers: dossiers.map((dossier) => ({
      id: dossier.id,
      status: dossier.status,
      error: dossier.error,
      selectedDocuments: dossier.selectedDocumentCount,
      selectedDomains: dossier.selectedDomainCount,
      selectedChunks: dossier.selectedChunkCount,
      briefId: dossier.brief?.id ?? null,
    })),
    drafts: draftDiagnostics,
    blockingReasons,
    validated: stages.briefs > 0
      && stages.drafts > 0
      && stages.verifications > 0
      && stages.publishedArticles > 0,
  };
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
