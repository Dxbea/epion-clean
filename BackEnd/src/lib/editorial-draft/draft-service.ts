import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import logger from '../logger.js';
import type { EditorialBriefContent, EditorialEvidenceSnapshot } from '../editorial-brief/types.js';
import { OpenAIEditorialClaimCritic, OpenAIEditorialDraftGenerator } from './draft-generator.js';
import { validateEditorialClaimReviews, validateEditorialDraftArtifact } from './draft-validation.js';
import { calculateEditorialQualityGate } from './quality-gate.js';
import {
  DEFAULT_EDITORIAL_DRAFT_CONFIG,
  EDITORIAL_CRITIC_PROMPT_VERSION,
  EDITORIAL_DRAFT_PROMPT_VERSION,
  EDITORIAL_DRAFT_VERSION,
  EDITORIAL_QUALITY_GATE_VERSION,
  type EditorialClaimCritic,
  type EditorialDraftConfig,
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
}): string {
  return createHash('sha256').update(JSON.stringify({
    ...input,
    draftVersion: EDITORIAL_DRAFT_VERSION,
    draftPromptVersion: EDITORIAL_DRAFT_PROMPT_VERSION,
    criticPromptVersion: EDITORIAL_CRITIC_PROMPT_VERSION,
    gateVersion: EDITORIAL_QUALITY_GATE_VERSION,
  })).digest('hex');
}

export async function generateControlledEditorialDraft(
  client: PrismaClient,
  briefId: string,
  options: {
    config?: Partial<EditorialDraftConfig>;
    generator?: EditorialDraftGenerator;
    critic?: EditorialClaimCritic;
    now?: Date;
  } = {},
): Promise<ControlledEditorialDraftResult> {
  const config = resolveEditorialDraftConfig(options.config);
  const generator = options.generator ?? new OpenAIEditorialDraftGenerator();
  const critic = options.critic ?? new OpenAIEditorialClaimCritic();
  const now = options.now ?? new Date();
  const source = await loadValidatedBrief(client, briefId);
  const evidence = source.dossier.evidence.map(toEvidenceSnapshot);
  const brief = source.structuredContent as unknown as EditorialBriefContent;
  assertBriefAudit(brief, source.dossier.id, source.dossier.evidenceHash!);
  const idempotencyKey = buildEditorialDraftIdempotencyKey({
    briefId,
    briefContentHash: source.contentHash,
    evidenceHash: source.dossier.evidenceHash!,
    generatorModel: generator.model,
    criticModel: critic.model,
    config,
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
    });
    const artifact = validateEditorialDraftArtifact(generated.artifact, evidence, config.maximumClaims);
    const criticized = await critic.review({ claims: artifact.claims, evidence });
    const reviews = validateEditorialClaimReviews(criticized.reviews, artifact);
    const gate = calculateEditorialQualityGate({
      artifact,
      reviews,
      evidence,
      riskLevel: source.dossier.candidate.riskLevel,
      config,
    });
    const contentHash = hashEditorialDraftArtifact(artifact);
    const contentHtml = renderEditorialDraftHtml(artifact);
    const inputTokens = nullableSum(generated.inputTokens, criticized.inputTokens);
    const outputTokens = nullableSum(generated.outputTokens, criticized.outputTokens);
    const estimatedCostMicros = nullableSum(generated.estimatedCostMicros, criticized.estimatedCostMicros);
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
      await transaction.editorialDraft.update({
        where: { id: draft.id },
        data: {
          status,
          title: artifact.title,
          summary: artifact.summary,
          contentHtml,
          structuredContent: artifact as unknown as Prisma.InputJsonValue,
          contentHash,
          generatedAt: new Date(),
          completedAt: new Date(),
          leaseExpiresAt: null,
          metrics: { inputTokens, outputTokens, estimatedCostMicros, claims: artifact.claims.length },
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

async function loadValidatedBrief(client: PrismaClient, briefId: string) {
  const brief = await client.editorialBrief.findUnique({
    where: { id: briefId },
    include: {
      dossier: {
        include: {
          candidate: true,
          evidence: { orderBy: { position: 'asc' } },
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
}): EditorialEvidenceSnapshot { return { ...item }; }

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
function nullableSum(left: number | null, right: number | null): number | null { return left === null && right === null ? null : (left ?? 0) + (right ?? 0); }
function jsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numberOrNull(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function boundedNumber(value: number, min: number, max: number, name: string): void { if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`); }
function boundedInteger(value: number, min: number, max: number, name: string): void { if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
