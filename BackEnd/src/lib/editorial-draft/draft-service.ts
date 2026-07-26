import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import logger from '../logger.js';
import type { EditorialBriefContent, EditorialEvidenceSnapshot } from '../editorial-brief/types.js';
import {
  buildIndexedEvidenceDossier,
  filterIndexedSnapshotsByEvidenceDossier,
  markEvidenceDossierUsage,
} from '../article-generation-core/evidence-consumption.js';
import {
  resolveEvidenceProvenance,
  type EvidenceDiscoveryRow,
} from '../article-generation-core/evidence-dossier.js';
import { OpenAIEditorialClaimCritic, OpenAIEditorialDraftGenerator } from './draft-generator.js';
import { describeEditorialDraftValidationError, normalizeEditorialDraftArtifact, validateEditorialClaimReviews, validateEditorialDraftArtifact, validateEditorialDraftClaimDomainCoverage } from './draft-validation.js';
import { calculateEditorialQualityGate } from './quality-gate.js';
import {
  DEFAULT_EDITORIAL_DRAFT_CONFIG,
  EDITORIAL_CRITIC_PROMPT_VERSION,
  EDITORIAL_DRAFT_PROMPT_VERSION,
  EDITORIAL_DRAFT_VERSION,
  EDITORIAL_QUALITY_GATE_VERSION,
  type EditorialClaimCritic,
  type EditorialDraftArtifact,
  type EditorialDraftConfig,
  type EditorialDraftGenerationResult,
  type EditorialDraftGenerator,
  type EditorialQualityGateResult,
} from './types.js';

const draftLog = logger.child({ module: 'EditorialDraft' });
const DRAFT_LEASE_MS = 20 * 60_000;

export interface ControlledEditorialDraftResult {
  draftId: string;
  briefId: string;
  outcome: 'READY_FOR_REVIEW' | 'QUALITY_FAILED' | 'ALREADY_READY' | 'ALREADY_FAILED' | 'ARTICLE_DRAFT_ALREADY_CREATED';
  qualityScore: number;
  publishabilityScore: number;
  claims: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostMicros: number | null;
}

export class EditorialDraftInProgressError extends Error {
  constructor(key: string) {
    super(`Controlled editorial draft is already in progress: ${key}`);
    this.name = 'EditorialDraftInProgressError';
  }
}

export function resolveEditorialDraftConfig(input: Partial<EditorialDraftConfig> = {}): EditorialDraftConfig {
  const config = { ...DEFAULT_EDITORIAL_DRAFT_CONFIG, ...input };
  boundedNumber(config.minimumQualityScore, 0, 100, 'minimumQualityScore');
  boundedNumber(config.minimumPublishabilityScore, 0, 100, 'minimumPublishabilityScore');
  boundedNumber(config.minimumCitationCoverage, 0, 1, 'minimumCitationCoverage');
  boundedNumber(config.minimumSupportedClaimRatio, 0, 1, 'minimumSupportedClaimRatio');
  boundedNumber(config.minimumCoreClaimSupportRatio, 0, 1, 'minimumCoreClaimSupportRatio');
  boundedInteger(config.minimumDomains, 2, 10, 'minimumDomains');
  boundedInteger(config.highRiskMinimumDomains, config.minimumDomains, 10, 'highRiskMinimumDomains');
  boundedInteger(config.maximumClaims, 2, 50, 'maximumClaims');
  return config;
}

export function buildEditorialDraftIdempotencyKey(input: {
  briefId: string;
  briefContentHash: string;
  evidenceHash: string;
  generatorModel: string;
  criticModel: string;
  config: EditorialDraftConfig;
  retryKey?: string | null;
}): string {
  return createHash('sha256').update(JSON.stringify({
    ...input,
    draftVersion: EDITORIAL_DRAFT_VERSION,
    draftPromptVersion: EDITORIAL_DRAFT_PROMPT_VERSION,
    criticPromptVersion: EDITORIAL_CRITIC_PROMPT_VERSION,
    gateVersion: EDITORIAL_QUALITY_GATE_VERSION,
    retryKey: input.retryKey ?? null,
  })).digest('hex');
}

export async function generateControlledEditorialDraft(
  client: PrismaClient,
  briefId: string,
  options: {
    config?: Partial<EditorialDraftConfig>;
    generator?: EditorialDraftGenerator;
    critic?: EditorialClaimCritic;
    retryKey?: string | null;
    now?: Date;
  } = {},
): Promise<ControlledEditorialDraftResult> {
  const config = resolveEditorialDraftConfig(options.config);
  const generator = options.generator ?? new OpenAIEditorialDraftGenerator();
  const critic = options.critic ?? new OpenAIEditorialClaimCritic();
  const now = options.now ?? new Date();
  const source = await loadValidatedBrief(client, briefId);
  const frozenEvidence = source.dossier.evidence.map(toEvidenceSnapshot);
  const inputEvidenceDossier = buildIndexedEvidenceDossier(
    'AUTO_EDITORIAL',
    frozenEvidence.map((item) => ({
      evidenceKey: item.evidenceKey,
      documentId: item.documentId,
      chunkId: item.chunkId,
      sourceId: item.sourceId,
      canonicalUrl: item.canonicalUrl,
      domain: item.domain,
      documentTitle: item.documentTitle,
      role: item.role,
      provenance: item.provenance,
    })),
  );
  const evidence = filterIndexedSnapshotsByEvidenceDossier(
    frozenEvidence,
    inputEvidenceDossier,
  );
  if (evidence.length !== frozenEvidence.length || evidence.length === 0) {
    throw new Error('Editorial draft EvidenceDossier does not match its frozen indexed evidence');
  }
  const brief = source.structuredContent as unknown as EditorialBriefContent;
  assertBriefAudit(brief, source.dossier.id, source.dossier.evidenceHash!);
  const idempotencyKey = buildEditorialDraftIdempotencyKey({
    briefId,
    briefContentHash: source.contentHash,
    evidenceHash: source.dossier.evidenceHash!,
    generatorModel: generator.model,
    criticModel: critic.model,
    config,
    retryKey: options.retryKey,
  });
  await client.editorialDraft.createMany({
    data: [{
      briefId,
      idempotencyKey,
      draftVersion: EDITORIAL_DRAFT_VERSION,
      promptVersion: EDITORIAL_DRAFT_PROMPT_VERSION,
      generatorModel: generator.model,
      criticModel: critic.model,
      briefContentHash: source.contentHash,
      evidenceHash: source.dossier.evidenceHash!,
      configuration: config as unknown as Prisma.InputJsonValue,
    }],
    skipDuplicates: true,
  });
  const draft = await client.editorialDraft.findUnique({
    where: { idempotencyKey },
    include: { claims: true, qualityGate: true },
  });
  if (!draft) throw new Error(`Unable to resolve controlled editorial draft: ${idempotencyKey}`);
  if (draft.status === 'ARTICLE_DRAFT_CREATED') return storedResult(draft, 'ARTICLE_DRAFT_ALREADY_CREATED');
  if (draft.status === 'READY_FOR_REVIEW') return storedResult(draft, 'ALREADY_READY');
  if (draft.status === 'QUALITY_FAILED' || draft.status === 'HUMAN_REJECTED') return storedResult(draft, 'ALREADY_FAILED');

  const claimed = await client.editorialDraft.updateMany({
    where: {
      id: draft.id,
      OR: [
        { status: { in: ['PENDING', 'FAILED'] } },
        { status: 'GENERATING', OR: [{ leaseExpiresAt: { lt: now } }, { leaseExpiresAt: null }] },
      ],
    },
    data: {
      status: 'GENERATING',
      attempts: { increment: 1 },
      leaseExpiresAt: new Date(now.getTime() + DRAFT_LEASE_MS),
      error: null,
      completedAt: null,
    },
  });
  if (claimed.count !== 1) throw new EditorialDraftInProgressError(idempotencyKey);

  try {
    const generated = await generator.generate({
      brief,
      riskLevel: source.dossier.candidate.riskLevel,
      evidence,
      evidenceDossier: inputEvidenceDossier,
    });
    const validated = await validateGeneratedArtifact(generator, generated.artifact, {
      brief,
      riskLevel: source.dossier.candidate.riskLevel,
      evidence,
      evidenceDossier: inputEvidenceDossier,
    }, config.maximumClaims, draft.id, briefId);
    const artifact = validated.artifact;
    const criticized = await critic.review({ claims: artifact.claims, evidence });
    const reviews = validateEditorialClaimReviews(criticized.reviews, artifact);
    const usedEvidenceDossier = markEditorialDossierUsage(
      inputEvidenceDossier,
      artifact,
      evidence,
    );
    const gate = calculateEditorialQualityGate({
      artifact,
      reviews,
      evidence,
      riskLevel: source.dossier.candidate.riskLevel,
      config,
    });
    const contentHash = hashEditorialDraftArtifact(artifact);
    const contentHtml = renderEditorialDraftHtml(artifact);
    const inputTokens = nullableSum(generated.inputTokens, validated.repair?.inputTokens ?? null, criticized.inputTokens);
    const outputTokens = nullableSum(generated.outputTokens, validated.repair?.outputTokens ?? null, criticized.outputTokens);
    const estimatedCostMicros = nullableSum(generated.estimatedCostMicros, validated.repair?.estimatedCostMicros ?? null, criticized.estimatedCostMicros);
    const status = gate.automatedDecision === 'PASSED' ? 'READY_FOR_REVIEW' : 'QUALITY_FAILED';
    const evidenceByKey = new Map(evidence.map((item) => [item.evidenceKey, item]));
    const databaseEvidenceByKey = new Map(source.dossier.evidence.map((item) => [item.evidenceKey, item.id]));
    const reviewsByKey = new Map(reviews.map((review) => [review.claimKey, review]));
    const claimRows = artifact.claims.map((claim, position) => {
      const cited = claim.evidenceKeys.map((key) => evidenceByKey.get(key)!);
      const review = reviewsByKey.get(claim.claimKey)!;
      return {
        id: randomUUID(),
        draftId: draft.id,
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
    const revisionId = randomUUID();
    const completedAt = new Date();
    await client.$transaction(async (transaction) => {
      await transaction.editorialDraftClaim.deleteMany({ where: { draftId: draft.id } });
      await transaction.editorialDraftClaim.createMany({
        data: claimRows,
      });
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
      await transaction.editorialQualityGate.upsert({
        where: { draftId: draft.id },
        create: qualityGateData(draft.id, contentHash, gate),
        update: qualityGateUpdate(contentHash, gate),
      });
      await transaction.editorialDraftRevision.create({
        data: {
          id: revisionId,
          draftId: draft.id,
          version: 1,
          origin: 'GENERATED',
          status: gate.automatedDecision === 'PASSED' ? 'GATE_PASSED' : 'GATE_FAILED',
          title: artifact.title,
          summary: artifact.summary,
          contentHtml,
          structuredContent: artifact as unknown as Prisma.InputJsonValue,
          contentHash,
          criticModel: critic.model,
          criticPromptVersion: EDITORIAL_CRITIC_PROMPT_VERSION,
          criticReviews: reviews as unknown as Prisma.InputJsonValue,
          gateSnapshot: gate as unknown as Prisma.InputJsonValue,
          gateEvaluatedAt: completedAt,
          createdAt: completedAt,
        },
      });
      await transaction.editorialDraft.update({
        where: { id: draft.id },
        data: {
          status,
          title: artifact.title,
          summary: artifact.summary,
          contentHtml,
          structuredContent: artifact as unknown as Prisma.InputJsonValue,
          contentHash,
          currentRevisionId: revisionId,
          generatedAt: completedAt,
          completedAt,
          leaseExpiresAt: null,
          metrics: {
            inputTokens,
            outputTokens,
            estimatedCostMicros,
            claims: artifact.claims.length,
            articleGenerationMode: 'AUTO_EDITORIAL',
            evidenceDossier: usedEvidenceDossier,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });
    draftLog.info('Controlled editorial draft evaluated', {
      draftId: draft.id,
      briefId,
      decision: gate.automatedDecision,
      qualityScore: gate.qualityScore,
      publishabilityScore: gate.publishabilityScore,
      claims: artifact.claims.length,
      estimatedCostMicros,
    });
    return {
      draftId: draft.id,
      briefId,
      outcome: status,
      qualityScore: gate.qualityScore,
      publishabilityScore: gate.publishabilityScore,
      claims: artifact.claims.length,
      inputTokens,
      outputTokens,
      estimatedCostMicros,
    };
  } catch (error) {
    await client.editorialDraft.update({
      where: { id: draft.id },
      data: { status: 'FAILED', leaseExpiresAt: null, error: errorMessage(error).slice(0, 1_000) },
    }).catch(() => undefined);
    throw error;
  }
}

async function validateGeneratedArtifact(
  generator: EditorialDraftGenerator,
  rawArtifact: unknown,
  input: {
    brief: EditorialBriefContent;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    evidence: EditorialEvidenceSnapshot[];
    evidenceDossier: ReturnType<typeof buildIndexedEvidenceDossier>;
  },
  maximumClaims: number,
  draftId: string,
  briefId: string,
): Promise<{ artifact: EditorialDraftArtifact; repair: EditorialDraftGenerationResult | null }> {
  const normalizedArtifact = normalizeEditorialDraftArtifact(rawArtifact);
  try {
    const artifact = validateEditorialDraftArtifact(normalizedArtifact, input.evidence, maximumClaims);
    validateEditorialDraftClaimDomainCoverage(artifact, input.evidence);
    return { artifact, repair: null };
  } catch (initialError) {
    const validationError = describeEditorialDraftValidationError(initialError);
    draftLog.warn('Controlled editorial draft artifact validation failed; considering one repair', {
      draftId,
      briefId,
      validationError,
      repairAvailable: Boolean(generator.repair),
    });
    if (!generator.repair) {
      throw new Error(`Editorial draft artifact validation failed: ${validationError}`);
    }
    let repaired: EditorialDraftGenerationResult;
    try {
      repaired = await generator.repair({ ...input, artifact: normalizedArtifact, validationError });
    } catch (repairError) {
      throw new Error(`Editorial draft repair failed after validation error (${validationError}): ${describeEditorialDraftValidationError(repairError)}`);
    }
    try {
      const artifact = validateEditorialDraftArtifact(normalizeEditorialDraftArtifact(repaired.artifact), input.evidence, maximumClaims);
      validateEditorialDraftClaimDomainCoverage(artifact, input.evidence);
      return {
        artifact,
        repair: repaired,
      };
    } catch (repairError) {
      const repairedValidationError = describeEditorialDraftValidationError(repairError);
      draftLog.error('Controlled editorial draft artifact repair failed validation', {
        draftId,
        briefId,
        repairAttempts: 1,
        initialValidationError: validationError,
        repairedValidationError,
      });
      throw new Error(`Editorial draft artifact validation failed after one repair: initial=${validationError}; repaired=${repairedValidationError}`);
    }
  }
}

async function loadValidatedBrief(client: PrismaClient, briefId: string) {
  const brief = await client.editorialBrief.findUnique({
    where: { id: briefId },
    include: {
      dossier: {
        include: {
          candidate: true,
          evidence: {
            orderBy: { position: 'asc' },
            include: {
              document: {
                select: {
                  sourceId: true,
                  discoveries: {
                    orderBy: { lastSeenAt: 'desc' },
                    select: {
                      discoveredUrl: true,
                      metadata: true,
                      discoverySource: {
                        select: {
                          key: true,
                          connectorType: true,
                          configuration: true,
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
  if (!brief || !brief.shadowOnly || brief.dossier.status !== 'COMPLETED' || !brief.dossier.evidenceHash || !brief.dossier.evidence.length) {
    throw new Error('Editorial draft requires a completed brief with frozen evidence');
  }
  if (!brief.dossier.shadowOnly || !brief.dossier.candidate.shadowOnly) throw new Error('Editorial draft source must remain editorial-only');
  return brief;
}

function assertBriefAudit(brief: EditorialBriefContent, dossierId: string, evidenceHash: string): void {
  if (!brief || typeof brief !== 'object' || brief.schemaVersion !== 1 || brief.audit?.dossierId !== dossierId || brief.audit?.evidenceHash !== evidenceHash) {
    throw new Error('Editorial brief audit does not match its frozen dossier');
  }
}

function toEvidenceSnapshot(item: {
  evidenceKey: string; documentId: string; chunkId: string; role: 'PRIMARY' | 'CONTEXT'; position: number;
  similarity: number; documentTitle: string; canonicalUrl: string; domain: string; publishedAt: Date | null;
  chunkPosition: number; contentSnapshot: string; contentHash: string;
  document?: { sourceId: string | null; discoveries: EvidenceDiscoveryRow[] };
}): EditorialEvidenceSnapshot {
  const { document, ...snapshot } = item;
  return {
    ...snapshot,
    sourceId: document?.sourceId ?? null,
    provenance: resolveEvidenceProvenance(document?.discoveries ?? []),
  };
}

function markEditorialDossierUsage(
  dossier: ReturnType<typeof buildIndexedEvidenceDossier>,
  artifact: EditorialDraftArtifact,
  evidence: EditorialEvidenceSnapshot[],
) {
  const evidenceByKey = new Map(evidence.map((item) => [item.evidenceKey, item]));
  const documentIds = new Set<string>();
  const claimKeysByDocumentId = new Map<string, Set<string>>();
  for (const claim of artifact.claims) {
    for (const evidenceKey of claim.evidenceKeys) {
      const item = evidenceByKey.get(evidenceKey);
      if (!item) continue;
      documentIds.add(item.documentId);
      const claimKeys = claimKeysByDocumentId.get(item.documentId) ?? new Set<string>();
      claimKeys.add(claim.claimKey);
      claimKeysByDocumentId.set(item.documentId, claimKeys);
    }
  }
  return markEvidenceDossierUsage(dossier, {
    documentIds: [...documentIds],
    // The complete frozen evidence set was transmitted to the writer and
    // critic. Exact claim associations remain limited to documentIds and
    // claimKeysByDocumentId above.
    consultedDocumentIds: evidence.map((item) => item.documentId),
    claimKeysByDocumentId: Object.fromEntries(
      [...claimKeysByDocumentId].map(([documentId, claimKeys]) => [
        documentId,
        [...claimKeys],
      ]),
    ),
  });
}

function qualityGateData(draftId: string, contentHash: string, gate: EditorialQualityGateResult) {
  return { draftId, gateVersion: EDITORIAL_QUALITY_GATE_VERSION, ...qualityGateUpdate(contentHash, gate), humanReviewStatus: 'PENDING' as const };
}

function qualityGateUpdate(contentHash: string, gate: EditorialQualityGateResult) {
  return {
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
  };
}

export function renderEditorialDraftHtml(artifact: { sections: Array<{ heading: string; claimKeys: string[] }>; claims: Array<{ claimKey: string; text: string }> }): string {
  const claims = new Map(artifact.claims.map((claim) => [claim.claimKey, claim.text]));
  return artifact.sections.map((section) => {
    const paragraphs = section.claimKeys.map((key) => `<p data-editorial-claim="${escapeHtml(key)}">${escapeHtml(claims.get(key)!)}</p>`).join('');
    return `<section><h2>${escapeHtml(section.heading)}</h2>${paragraphs}</section>`;
  }).join('');
}

export function hashEditorialDraftArtifact(artifact: unknown): string {
  return createHash('sha256').update(JSON.stringify(stableJson(artifact))).digest('hex');
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableJson(nested)]));
  }
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function storedResult(draft: { id: string; briefId: string; claims: unknown[]; qualityGate: null | { qualityScore: number; publishabilityScore: number }; metrics: Prisma.JsonValue | null }, outcome: ControlledEditorialDraftResult['outcome']): ControlledEditorialDraftResult {
  const metrics = jsonRecord(draft.metrics);
  return {
    draftId: draft.id,
    briefId: draft.briefId,
    outcome,
    qualityScore: draft.qualityGate?.qualityScore ?? 0,
    publishabilityScore: draft.qualityGate?.publishabilityScore ?? 0,
    claims: draft.claims.length,
    inputTokens: numberOrNull(metrics.inputTokens),
    outputTokens: numberOrNull(metrics.outputTokens),
    estimatedCostMicros: numberOrNull(metrics.estimatedCostMicros),
  };
}

function unique(values: string[]): string[] { return [...new Set(values)].sort(); }
function nullableSum(...values: Array<number | null>): number | null { return values.every((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0); }
function jsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numberOrNull(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function boundedNumber(value: number, min: number, max: number, name: string): void { if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`); }
function boundedInteger(value: number, min: number, max: number, name: string): void { if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
