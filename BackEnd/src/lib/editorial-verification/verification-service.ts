import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { finalizeArticleAnalysis } from '../article-finalization.js';
import type { EditorialBriefContent } from '../editorial-brief/types.js';
import { editorialDraftArtifactToStructuredArticle } from '../editorial-draft/structured-article-adapter.js';
import type { EditorialDraftArtifact } from '../editorial-draft/types.js';
import { buildEnrichedSourceScoreEntry } from '../source-enrichment-source.js';
import type { SourceScoreEntry } from '../score-types.js';
import { getRichTrustScore } from '../trust-score.js';
import { MistralEditorialAuditor } from './mistral-auditor.js';
import { enrichEditorialEvidenceWithSerper, type EditorialSerperSearcher } from './serper-enrichment.js';
import { assessEditorialCorpus } from './sufficiency.js';
import { resolveEditorialValidationMode } from '../editorial-draft/validation-mode.js';
import { normalizeSourceDomain } from '../source-profile.js';
import {
  EDITORIAL_MISTRAL_PROMPT_VERSION,
  EDITORIAL_VERIFICATION_VERSION,
  RetryableEditorialVerificationDependencyError,
  type EditorialClaimForAudit,
  type EditorialCorpusAssessment,
  type EditorialMistralAuditor,
  type EditorialVerificationEvidence,
  type EditorialVerificationResult,
  type EditorialVerificationRetryReason,
  type EditorialVerificationSourceHydrator,
} from './types.js';

const VERIFICATION_LEASE_MS = 10 * 60_000;

export class TrustScoreEditorialSourceHydrator implements EditorialVerificationSourceHydrator {
  async hydrate(evidence: EditorialVerificationEvidence, index: number): Promise<SourceScoreEntry> {
    const richScore = await getRichTrustScore(evidence.domain, evidence.url, {
      content: evidence.extractionStatus === 'full' ? evidence.content : undefined,
      metaDescription: evidence.extractionStatus !== 'full' ? evidence.content : undefined,
    }, { sourceId: evidence.sourceId });
    const entry = buildEnrichedSourceScoreEntry({
      url: evidence.url,
      index,
      domain: evidence.domain,
      richScore,
      analysisStatus: 'ANALYZED',
      metadata: {
        extractionStatus: evidence.extractionStatus ?? (evidence.origin === 'SERPER' ? 'metadata_only' : 'full'),
        provider: evidence.origin === 'SERPER' ? 'web' : 'rag',
        role: evidence.officialStatement
          ? 'OFFICIAL_STATEMENT'
          : evidence.lane === 'PRIMARY'
            ? 'PRIMARY_EVIDENCE'
            : evidence.lane === 'COUNTERPOINT'
              ? 'COUNTERPOINT'
              : 'CONTEXT',
        provenance: evidence.origin === 'SERPER' ? 'WEB_SEARCH' : 'EDITORIAL',
        officialStatement: evidence.officialStatement,
        contentTitle: evidence.title,
      },
    });
    entry.metadata = { ...entry.metadata, supportStrength: evidence.lane === 'CONTEXT' ? 'MODERATE' : 'STRONG' };
    return entry;
  }
}

export interface EditorialVerificationDependencies {
  mistralAuditor: EditorialMistralAuditor;
  sourceHydrator: EditorialVerificationSourceHydrator;
  serperSearcher?: EditorialSerperSearcher;
  finalizeArticle: typeof finalizeArticleAnalysis;
  now: () => Date;
}

const defaultDependencies: EditorialVerificationDependencies = {
  mistralAuditor: new MistralEditorialAuditor(),
  sourceHydrator: new TrustScoreEditorialSourceHydrator(),
  finalizeArticle: finalizeArticleAnalysis,
  now: () => new Date(),
};

export class EditorialVerificationInProgressError extends Error {
  constructor() {
    super('Editorial verification is already running for this revision');
    this.name = 'EditorialVerificationInProgressError';
  }
}

export async function verifyEditorialDraftForFinalization(
  client: PrismaClient,
  input: { draftId: string; expectedContentHash: string; retryReason?: EditorialVerificationRetryReason | null; retryAttempt?: number },
  dependencyOverrides: Partial<EditorialVerificationDependencies> = {},
): Promise<EditorialVerificationResult> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const now = dependencies.now();
  const draft = await loadVerificationDraft(client, input.draftId);
  validateDraft(draft, input.expectedContentHash);
  const idempotencyKey = createHash('sha256').update(JSON.stringify({
    version: EDITORIAL_VERIFICATION_VERSION,
    draftId: draft.id,
    revisionId: draft.currentRevision.id,
    articleId: draft.article.id,
    contentHash: draft.contentHash,
    mistralPromptVersion: EDITORIAL_MISTRAL_PROMPT_VERSION,
    mistralModel: dependencies.mistralAuditor.model,
    retryReason: input.retryReason ?? null,
    retryAttempt: input.retryAttempt ?? 0,
  })).digest('hex');
  await client.editorialVerificationRun.createMany({
    data: [{
      idempotencyKey,
      draftId: draft.id,
      revisionId: draft.currentRevision.id,
      articleId: draft.article.id,
      contentHash: draft.contentHash,
      verificationVersion: EDITORIAL_VERIFICATION_VERSION,
      mistralModel: dependencies.mistralAuditor.model,
      mistralPromptVersion: EDITORIAL_MISTRAL_PROMPT_VERSION,
    }],
    skipDuplicates: true,
  });
  const run = await client.editorialVerificationRun.findUnique({ where: { idempotencyKey } });
  if (!run) throw new Error('Unable to resolve editorial verification run');
  if (run.status === 'PASSED' && draft.article.factCheckStatus === 'COMPLETED') {
    return {
      runId: run.id,
      draftId: draft.id,
      revisionId: draft.currentRevision.id,
      articleId: draft.article.id,
      outcome: 'ALREADY_FINALIZED',
      serperRequired: run.serperRequired,
      serperDocuments: jsonStringArray(run.serperDocumentIds).length,
      mistralReasons: [],
      factCheckScore: run.factCheckScore,
    };
  }
  const claimed = await client.editorialVerificationRun.updateMany({
    where: {
      id: run.id,
      OR: [
        { status: { in: ['PENDING', 'FAILED', 'HUMAN_REVIEW_REQUIRED', 'PASSED'] } },
        { status: 'RUNNING', OR: [{ leaseExpiresAt: { lt: now } }, { leaseExpiresAt: null }] },
      ],
    },
    data: {
      status: 'RUNNING',
      attempts: { increment: 1 },
      startedAt: now,
      completedAt: null,
      leaseExpiresAt: new Date(now.getTime() + VERIFICATION_LEASE_MS),
      error: null,
    },
  });
  if (claimed.count !== 1) throw new EditorialVerificationInProgressError();
  await client.article.updateMany({
    where: { id: draft.article.id, status: 'DRAFT' },
    data: { factCheckStatus: 'RUNNING', factCheckStartedAt: now, factCheckError: null },
  });

  try {
    const brief = draft.brief.structuredContent as unknown as EditorialBriefContent;
    const artifact = draft.currentRevision.structuredContent as unknown as EditorialDraftArtifact;
    const claims = buildClaimsForAudit(draft.claims);
    const corpusEvidence = buildCorpusEvidence(draft.brief.dossier.evidence, brief);
    const initialAssessment = assessEditorialCorpus({
      brief,
      claims,
      evidence: corpusEvidence,
      riskLevel: draft.brief.dossier.candidate.riskLevel,
      latestEventAt: draft.brief.dossier.candidate.topic.latestEventAt,
      now,
    });
    const serper = initialAssessment.sufficient
      ? { queries: [], evidence: [], documentIds: [] }
      : await enrichEditorialEvidenceWithSerper(client, {
          topic: brief.topicLabel || draft.title,
          reasons: initialAssessment.reasons,
          existingEvidence: corpusEvidence,
          language: draft.brief.dossier.candidate.topic.language,
          now,
        }, dependencies.serperSearcher);
    const combinedEvidence = deduplicateEvidence([...corpusEvidence, ...serper.evidence]);
    const finalAssessment = assessEditorialCorpus({
      brief,
      claims,
      evidence: combinedEvidence,
      riskLevel: draft.brief.dossier.candidate.riskLevel,
      latestEventAt: draft.brief.dossier.candidate.topic.latestEventAt,
      recentRefreshPerformed: serper.queries.length > 0 && serper.evidence.length > 0,
      now,
    });
    const { sources, identityReasons, hydratedEvidence } = await hydrateSources(client, combinedEvidence, dependencies.sourceHydrator);
    const mistralAudit = await dependencies.mistralAuditor.audit({
      title: draft.title,
      summary: draft.summary,
      contentHtml: draft.contentHtml,
      claims,
      evidence: hydratedEvidence,
    });
    const auditedEvidenceKeys = new Set(mistralAudit.claims.flatMap((claim) => claim.evidenceKeys));
    const auditedEvidence = hydratedEvidence.filter((item) => auditedEvidenceKeys.has(item.evidenceKey));
    const auditedDomains = new Set(auditedEvidence.map((item) => normalizeSourceDomain(item.domain) ?? item.domain));
    const evidenceByKey = new Map(hydratedEvidence.map((item) => [item.evidenceKey, item]));
    const coreMetadataOnly = mistralAudit.claims.some((audit) => {
      const claim = claims.find((item) => item.claimKey === audit.claimKey);
      const cited = audit.evidenceKeys.map((key) => evidenceByKey.get(key)).filter(Boolean);
      return claim?.importance === 'CORE' && cited.length > 0
        && cited.every((item) => item?.extractionStatus !== 'full');
    });
    const auditCoverageReasons = [
      ...(auditedDomains.size < finalAssessment.requiredDomains ? ['MISTRAL_INSUFFICIENT_CITED_DOMAIN_DIVERSITY'] : []),
      ...(!auditedEvidence.some((item) => item.lane === 'PRIMARY' || item.officialStatement) ? ['MISTRAL_PRIMARY_SOURCE_NOT_CITED'] : []),
      ...(!auditedEvidence.some((item) => item.lane === 'COUNTERPOINT') && draftCitesCounterpointEvidence(claims, brief) ? ['MISTRAL_COUNTERPOINT_NOT_CITED'] : []),
      ...(coreMetadataOnly ? ['CORE_CLAIM_ONLY_METADATA_EVIDENCE'] : []),
    ];
    const gateReasons = unique([
      ...finalAssessment.reasons.filter((reason) => reason !== 'INSUFFICIENT_CLAIM_COVERAGE'),
      ...identityReasons,
      ...mistralAudit.reasons,
      ...auditCoverageReasons,
    ]);
    const completedAt = dependencies.now();
    if (gateReasons.length > 0 || mistralAudit.outcome !== 'PASSED') {
      await persistFailClosed(client, {
        runId: run.id,
        articleId: draft.article.id,
        initialAssessment,
        finalAssessment,
        serper,
        mistralAudit,
        gateReasons,
        sources,
        completedAt,
      });
      return {
        runId: run.id,
        draftId: draft.id,
        revisionId: draft.currentRevision.id,
        articleId: draft.article.id,
        outcome: 'HUMAN_REVIEW_REQUIRED',
        serperRequired: !initialAssessment.sufficient,
        serperDocuments: serper.documentIds.length,
        mistralReasons: gateReasons,
        factCheckScore: null,
      };
    }
    const auditByClaim = new Map(mistralAudit.claims.map((claim) => [claim.claimKey, claim]));
    const enrichedArtifact: EditorialDraftArtifact = {
      ...artifact,
      claims: artifact.claims.map((claim) => ({
        ...claim,
        evidenceKeys: unique([...claim.evidenceKeys, ...(auditByClaim.get(claim.claimKey)?.evidenceKeys ?? [])]),
      })),
    };
    const publicStructuredContent = editorialDraftArtifactToStructuredArticle(enrichedArtifact, {
      evidence: auditedEvidence.map((item) => ({
        evidenceKey: item.evidenceKey,
        url: item.url,
        title: item.title,
        domain: item.domain,
      })),
      claimVerdicts: Object.fromEntries(mistralAudit.claims.map((claim) => [claim.claimKey, claim.verdict])),
    });
    const structuredContent = {
      ...publicStructuredContent,
      origin: 'EPION_AUTOMATIC_EDITORIAL',
      editorialDraftId: draft.id,
      editorialRevisionId: draft.currentRevision.id,
      editorialRevisionVersion: draft.currentRevision.version,
      editorialBriefId: draft.briefId,
      contentHash: draft.contentHash,
      editorialVerificationRunId: run.id,
    } as unknown as typeof publicStructuredContent;
    const auditedUrls = new Set(auditedEvidence.map((item) => item.url));
    const finalSources = sources.filter((source) => auditedUrls.has(source.url));
    const finalization = await dependencies.finalizeArticle(client, {
      articleId: draft.article.id,
      title: draft.title,
      summary: draft.summary,
      content: draft.contentHtml,
      structuredContent,
      contentScore: draft.qualityGate.publishabilityScore,
      sources: finalSources,
      replaceArticleSources: true,
      liveAnalysis: {
        mode: 'editorial-verification-v1',
        verificationRunId: run.id,
        primaryCriticModel: draft.criticModel,
        mistralModel: mistralAudit.model,
        mistralOutcome: mistralAudit.outcome,
        contradictions: mistralAudit.contradictions,
      },
      completedAt,
    }, {
      afterPersist: async (transaction, contract) => {
        await transaction.editorialVerificationRun.update({
          where: { id: run.id },
          data: {
            status: 'PASSED',
            corpusAssessment: { initial: initialAssessment, final: finalAssessment } as unknown as Prisma.InputJsonValue,
            serperRequired: !initialAssessment.sufficient,
            serperReasons: initialAssessment.reasons,
            serperQueries: serper.queries as unknown as Prisma.InputJsonValue,
            serperDocumentIds: serper.documentIds,
            mistralAudit: mistralAudit as unknown as Prisma.InputJsonValue,
            gateReasons: [],
            sourceSnapshot: finalSources as unknown as Prisma.InputJsonValue,
            factCheckScore: contract.factCheckScore,
            factCheckContentHash: contract.factCheckContentHash,
            completedAt,
            leaseExpiresAt: null,
            error: null,
          },
        });
      },
    });
    return {
      runId: run.id,
      draftId: draft.id,
      revisionId: draft.currentRevision.id,
      articleId: draft.article.id,
      outcome: 'FINALIZED',
      serperRequired: !initialAssessment.sufficient,
      serperDocuments: serper.documentIds.length,
      mistralReasons: [],
      factCheckScore: finalization.factCheckScore,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.$transaction([
      client.editorialVerificationRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', completedAt: dependencies.now(), leaseExpiresAt: null, error: message.slice(0, 1_000) },
      }),
      client.article.update({
        where: { id: draft.article.id },
        data: { factCheckStatus: 'FAILED', factCheckCompletedAt: dependencies.now(), factCheckError: message.slice(0, 1_000) },
      }),
    ]).catch(() => undefined);
    throw error;
  }
}

async function loadVerificationDraft(client: PrismaClient, draftId: string) {
  return client.editorialDraft.findUnique({
    where: { id: draftId },
    include: {
      currentRevision: {
        include: {
          publicationAuthorizations: { where: { status: 'AUTHORIZED' }, select: { id: true } },
        },
      },
      article: true,
      qualityGate: true,
      brief: {
        include: {
          dossier: {
            include: {
              candidate: { include: { topic: true } },
              evidence: { orderBy: { position: 'asc' }, include: { document: { include: { source: true } } } },
            },
          },
        },
      },
      claims: { orderBy: { position: 'asc' } },
    },
  });
}

function validateDraft(draft: Awaited<ReturnType<typeof loadVerificationDraft>>, expectedContentHash: string): asserts draft is NonNullable<typeof draft> & {
  article: NonNullable<NonNullable<typeof draft>['article']>;
  currentRevision: NonNullable<NonNullable<typeof draft>['currentRevision']>;
  qualityGate: NonNullable<NonNullable<typeof draft>['qualityGate']>;
  title: string; summary: string; contentHtml: string; contentHash: string;
} {
  if (!draft || !draft.article || !draft.currentRevision || !draft.qualityGate || !draft.title || !draft.summary || !draft.contentHtml || !draft.contentHash) {
    throw new Error('Editorial verification requires an approved Article DRAFT and current revision');
  }
  if (draft.article.status !== 'DRAFT') throw new Error('Editorial verification only finalizes an Article DRAFT');
  if (draft.contentHash !== expectedContentHash || draft.currentRevision.contentHash !== expectedContentHash) {
    throw new Error('Editorial verification content hash mismatch');
  }
  const validationMode = resolveEditorialValidationMode();
  if (draft.qualityGate.automatedDecision !== 'PASSED' || (validationMode === 'human_review' && draft.qualityGate.humanReviewStatus !== 'APPROVED')) {
    throw new Error(validationMode === 'quality_gate'
      ? 'Editorial verification requires the passed quality gate'
      : 'Editorial verification requires the existing automated and human gates');
  }
  if (draft.currentRevision.publicationAuthorizations.length > 0) {
    throw new Error('Editorial verification must complete before publication authorization');
  }
}

function buildClaimsForAudit(claims: Array<{
  claimKey: string; text: string; importance: EditorialClaimForAudit['importance'];
  verdict: EditorialClaimForAudit['primaryVerdict']; evidenceKeys: Prisma.JsonValue;
}>): EditorialClaimForAudit[] {
  return claims.map((claim) => ({
    claimKey: claim.claimKey,
    text: claim.text,
    importance: claim.importance,
    primaryVerdict: claim.verdict,
    evidenceKeys: jsonStringArray(claim.evidenceKeys),
  }));
}

function buildCorpusEvidence(evidence: Array<any>, brief: EditorialBriefContent): EditorialVerificationEvidence[] {
  const counterpointKeys = new Set(brief.contradictions.flatMap((contradiction) =>
    contradiction.sides.slice(1).flatMap((side) => side.evidenceKeys)));
  return evidence.map((item) => ({
    evidenceKey: item.evidenceKey,
    documentId: item.documentId,
    sourceId: item.document.sourceId ?? null,
    url: item.canonicalUrl,
    title: item.documentTitle,
    domain: normalizeSourceDomain(item.domain) ?? item.domain.trim().toLowerCase(),
    content: item.contentSnapshot,
    publishedAt: item.publishedAt,
    lane: counterpointKeys.has(item.evidenceKey) ? 'COUNTERPOINT' : item.role === 'PRIMARY' ? 'PRIMARY' : 'CONTEXT',
    origin: 'CORPUS',
    officialStatement: false,
    extractionStatus: 'full',
  }));
}

function draftCitesCounterpointEvidence(claims: EditorialClaimForAudit[], brief: EditorialBriefContent): boolean {
  const counterpointKeys = new Set(brief.contradictions.flatMap((contradiction) =>
    contradiction.sides.slice(1).flatMap((side) => side.evidenceKeys)));
  return claims.some((claim) => claim.evidenceKeys.some((evidenceKey) => counterpointKeys.has(evidenceKey)));
}

async function hydrateSources(
  client: PrismaClient,
  evidence: EditorialVerificationEvidence[],
  hydrator: EditorialVerificationSourceHydrator,
): Promise<{ sources: SourceScoreEntry[]; identityReasons: string[]; hydratedEvidence: EditorialVerificationEvidence[] }> {
  const sources: SourceScoreEntry[] = [];
  const hydratedEvidence: EditorialVerificationEvidence[] = [];
  const identityReasons: string[] = [];
  for (const item of evidence) {
    let source: SourceScoreEntry;
    try {
      source = await hydrator.hydrate(item, sources.length);
    } catch (error) {
      if (error instanceof RetryableEditorialVerificationDependencyError) throw error;
      identityReasons.push(`SOURCE_HYDRATION_FAILED:${item.domain}`);
      continue;
    }
    if (!source.durableSourceId) {
      identityReasons.push(`SOURCE_IDENTITY_MISSING:${item.domain}`);
      continue;
    }
    if (item.sourceId && item.sourceId !== source.durableSourceId) {
      identityReasons.push(`SOURCE_IDENTITY_MISMATCH:${item.domain}`);
      continue;
    }
    const updated = await client.ingestedDocument.updateMany({
      where: { id: item.documentId, OR: [{ sourceId: null }, { sourceId: source.durableSourceId }] },
      data: { sourceId: source.durableSourceId },
    });
    if (updated.count !== 1) {
      identityReasons.push(`SOURCE_IDENTITY_MISMATCH:${item.domain}`);
      continue;
    }
    source.id = sources.length + 1;
    sources.push(source);
    hydratedEvidence.push({ ...item, sourceId: source.durableSourceId });
  }
  return { sources: deduplicateSources(sources), identityReasons: unique(identityReasons), hydratedEvidence };
}

async function persistFailClosed(client: PrismaClient, input: {
  runId: string;
  articleId: string;
  initialAssessment: EditorialCorpusAssessment;
  finalAssessment: EditorialCorpusAssessment;
  serper: { queries: unknown[]; documentIds: string[] };
  mistralAudit: unknown;
  gateReasons: string[];
  sources: SourceScoreEntry[];
  completedAt: Date;
}): Promise<void> {
  await client.$transaction([
    client.editorialVerificationRun.update({
      where: { id: input.runId },
      data: {
        status: 'HUMAN_REVIEW_REQUIRED',
        corpusAssessment: { initial: input.initialAssessment, final: input.finalAssessment } as unknown as Prisma.InputJsonValue,
        serperRequired: !input.initialAssessment.sufficient,
        serperReasons: input.initialAssessment.reasons,
        serperQueries: input.serper.queries as Prisma.InputJsonValue,
        serperDocumentIds: input.serper.documentIds,
        mistralAudit: input.mistralAudit as Prisma.InputJsonValue,
        gateReasons: input.gateReasons,
        sourceSnapshot: input.sources as unknown as Prisma.InputJsonValue,
        completedAt: input.completedAt,
        leaseExpiresAt: null,
        error: input.gateReasons.join(', ').slice(0, 1_000),
      },
    }),
    client.article.update({
      where: { id: input.articleId },
      data: {
        factCheckStatus: 'FAILED',
        factCheckScore: null,
        factCheckData: Prisma.JsonNull,
        factCheckContentHash: null,
        factCheckCompletedAt: input.completedAt,
        factCheckError: input.gateReasons.join(', ').slice(0, 1_000),
      },
    }),
  ]);
}

function deduplicateEvidence(evidence: EditorialVerificationEvidence[]): EditorialVerificationEvidence[] {
  const byUrl = new Map<string, EditorialVerificationEvidence>();
  for (const item of evidence) if (!byUrl.has(item.url)) byUrl.set(item.url, item);
  return [...byUrl.values()];
}

function deduplicateSources(sources: SourceScoreEntry[]): SourceScoreEntry[] {
  const byUrl = new Map<string, SourceScoreEntry>();
  for (const source of sources) if (!byUrl.has(source.url)) byUrl.set(source.url, source);
  return [...byUrl.values()].map((source, index) => ({ ...source, id: index + 1 }));
}

function unique(values: string[]): string[] { return [...new Set(values)]; }
function jsonStringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
