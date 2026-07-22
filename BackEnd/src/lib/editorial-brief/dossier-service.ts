import { createHash } from 'node:crypto';
import { Prisma, type EditorialRiskLevel, type PrismaClient } from '@prisma/client';
import logger from '../logger.js';
import { OpenAIEditorialBriefGenerator } from './brief-generator.js';
import { buildAuditableBriefContent, validateEditorialBriefDraft } from './brief-validation.js';
import { loadEditorialEvidenceRows, selectEditorialEvidence } from './evidence-selection.js';
import { enrichEditorialTopicSources } from '../editorial-source-enrichment/source-enrichment-service.js';
import {
  DEFAULT_EDITORIAL_BRIEF_CONFIG,
  EDITORIAL_BRIEF_PROMPT_VERSION,
  EDITORIAL_BRIEF_SCHEMA_VERSION,
  EDITORIAL_DOSSIER_VERSION,
  type EditorialBriefConfig,
  type EditorialBriefGenerator,
  type EditorialEvidenceSnapshot,
  type SelectedEditorialCandidate,
} from './types.js';

const editorialBriefLog = logger.child({ module: 'EditorialBrief' });
const DOSSIER_LEASE_MS = 15 * 60_000;

interface CandidateRecord {
  id: string;
  editorialScore: number;
  riskLevel: EditorialRiskLevel;
  shadowOnly: boolean;
  status: 'SHADOW_PROPOSED' | 'SHADOW_SUPPRESSED';
  topic: {
    id: string;
    label: string;
    runId: string;
    independentDomainCount: number;
    documentCount: number;
    representativeDocumentId: string;
    latestEventAt: Date;
  };
}

export interface EditorialDossierResult {
  dossierId: string;
  candidateId: string;
  outcome: 'COMPLETED' | 'ALREADY_COMPLETED' | 'BLOCKED' | 'ALREADY_BLOCKED';
  evidenceCount: number;
  domainCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostMicros: number | null;
  reason?: string | null;
}

export interface EditorialBriefBatchResult {
  editorialRunId: string;
  selectedCandidates: number;
  completed: number;
  alreadyCompleted: number;
  blocked: number;
  evidenceChunks: number;
  durationMs: number;
  results: EditorialDossierResult[];
  selectionDiagnostics: string[];
}

export class EditorialDossierInProgressError extends Error {
  constructor(idempotencyKey: string) {
    super(`Editorial source dossier is already in progress: ${idempotencyKey}`);
    this.name = 'EditorialDossierInProgressError';
  }
}

export function resolveEditorialBriefConfig(
  input: Partial<EditorialBriefConfig> & { prodShadowControlled?: boolean } = {},
): EditorialBriefConfig {
  const { prodShadowControlled, ...overrides } = input;
  const config = { ...DEFAULT_EDITORIAL_BRIEF_CONFIG, ...overrides };
  boundedNumber(config.minimumEditorialScore, 0, 100, 'minimumEditorialScore');
  boundedInteger(config.minimumDomains, 2, 10, 'minimumDomains');
  boundedInteger(config.highRiskMinimumDomains, config.minimumDomains, 10, 'highRiskMinimumDomains');
  boundedInteger(config.maximumCandidates, 1, 20, 'maximumCandidates');
  // A controlled prod-shadow run may intentionally use its one known document.
  // Normal briefs retain the high-risk diversity invariant.
  boundedInteger(config.maximumDocuments, prodShadowControlled === true ? 1 : config.highRiskMinimumDomains, 20, 'maximumDocuments');
  boundedInteger(config.maximumChunksPerDocument, 1, 5, 'maximumChunksPerDocument');
  boundedInteger(config.maximumEvidenceChunks, config.maximumDocuments, 50, 'maximumEvidenceChunks');
  boundedNumber(config.minimumChunkSimilarity, -1, 1, 'minimumChunkSimilarity');
  return config;
}

export async function selectEditorialCandidates(
  client: PrismaClient,
  editorialRunId: string,
  input: Partial<EditorialBriefConfig> & { prodShadowControlled?: boolean } = {},
): Promise<SelectedEditorialCandidate[]> {
  const config = resolveEditorialBriefConfig(input);
  const controlled = input.prodShadowControlled === true;
  const candidates = await client.editorialCandidate.findMany({
    where: {
      shadowOnly: true,
      // A source-poor topic is a candidate for enrichment, not a publishable brief.
      // The strict domain threshold is enforced again after enrichment.
      status: { in: ['SHADOW_PROPOSED', 'SHADOW_SUPPRESSED'] },
      editorialScore: controlled ? undefined : { gte: config.minimumEditorialScore },
      topic: { runId: editorialRunId },
    },
    select: {
      id: true,
      editorialScore: true,
      riskLevel: true,
      topic: { select: { independentDomainCount: true, latestEventAt: true } },
    },
    orderBy: [
      { editorialScore: 'desc' },
      { freshnessScore: 'desc' },
      { topic: { latestEventAt: 'desc' } },
      { id: 'asc' },
    ],
    take: controlled ? 1 : config.maximumCandidates * 3,
  });
  return candidates
    .map((candidate) => ({
      candidateId: candidate.id,
      editorialScore: candidate.editorialScore,
      riskLevel: candidate.riskLevel,
      requiredDomains: controlled ? 1 : requiredDomains(candidate.riskLevel, config),
      availableDomains: candidate.topic.independentDomainCount,
    }))
    .slice(0, controlled ? 1 : config.maximumCandidates)
    .map(({ availableDomains: _availableDomains, ...candidate }, index) => ({
      ...candidate,
      rank: index + 1,
    }));
}

export function buildEditorialDossierIdempotencyKey(input: {
  candidateId: string;
  dossierVersion: string;
  promptVersion: string;
  generatorModel: string;
  config: EditorialBriefConfig;
}): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export async function buildEditorialSourceDossier(
  client: PrismaClient,
  candidateId: string,
  selectionRank: number,
  options: {
    config?: Partial<EditorialBriefConfig>;
    generator?: EditorialBriefGenerator;
    now?: Date;
    prodShadowControlled?: boolean;
  } = {},
): Promise<EditorialDossierResult> {
  const generator = options.generator ?? new OpenAIEditorialBriefGenerator();
  const now = options.now ?? new Date();
  const candidate = await loadCandidate(client, candidateId);
  const controlled = options.prodShadowControlled === true;
  const config = resolveEditorialBriefConfig({ ...options.config, prodShadowControlled: controlled });
  const minimumDomains = controlled ? 1 : requiredDomains(candidate.riskLevel, config);
  const idempotencyKey = buildEditorialDossierIdempotencyKey({
    candidateId,
    dossierVersion: EDITORIAL_DOSSIER_VERSION,
    promptVersion: EDITORIAL_BRIEF_PROMPT_VERSION,
    generatorModel: generator.model,
    config,
  });
  await client.editorialSourceDossier.createMany({
    data: [{
      candidateId,
      idempotencyKey,
      dossierVersion: EDITORIAL_DOSSIER_VERSION,
      generatorModel: generator.model,
      promptVersion: EDITORIAL_BRIEF_PROMPT_VERSION,
      selectionRank,
      minimumDomains,
      maxDocuments: config.maximumDocuments,
      maxChunksPerDocument: config.maximumChunksPerDocument,
      configuration: config as unknown as Prisma.InputJsonValue,
      candidateSnapshot: candidateSnapshot(candidate) as Prisma.InputJsonValue,
      shadowOnly: true,
    }],
    skipDuplicates: true,
  });
  let dossier = await client.editorialSourceDossier.findUnique({
    where: { idempotencyKey },
    include: { evidence: { orderBy: { position: 'asc' } }, brief: true },
  });
  if (!dossier) throw new Error(`Unable to resolve editorial source dossier: ${idempotencyKey}`);
  const dossierId = dossier.id;
  if (dossier.status === 'COMPLETED') return persistedResult(dossier, 'ALREADY_COMPLETED');
  if (dossier.status === 'BLOCKED') return persistedResult(dossier, 'ALREADY_BLOCKED');

  const claimed = await client.editorialSourceDossier.updateMany({
    where: {
      id: dossier.id,
      OR: [
        { status: { in: ['PENDING', 'FAILED'] } },
        {
          status: { in: ['RUNNING', 'EVIDENCE_READY'] },
          OR: [{ leaseExpiresAt: { lt: now } }, { leaseExpiresAt: null }],
        },
      ],
    },
    data: {
      status: 'RUNNING',
      attempts: { increment: 1 },
      leaseExpiresAt: new Date(now.getTime() + DOSSIER_LEASE_MS),
      error: null,
      completedAt: null,
    },
  });
  if (claimed.count !== 1) throw new EditorialDossierInProgressError(idempotencyKey);

  try {
    const enrichment = await enrichEditorialTopicSources(client, candidateId, {
      requiredDomains: minimumDomains,
      maximumDocuments: config.maximumDocuments,
      now,
    });
    if (enrichment.enrichmentStatus !== 'SUFFICIENT') {
      const reason = 'SOURCE_ENRICHMENT_INSUFFICIENT';
      const blocked = await client.editorialSourceDossier.update({
        where: { id: dossier.id },
        data: {
          status: 'BLOCKED',
          error: reason,
          sourceDomains: enrichment.independentDomains,
          selectedDomainCount: enrichment.independentDomains.length,
          leaseExpiresAt: null,
          completedAt: new Date(),
          metrics: { enrichment } as unknown as Prisma.InputJsonValue,
        },
        include: { evidence: true, brief: true },
      });
      return { ...persistedResult(blocked, 'BLOCKED'), reason };
    }
    const enrichedCandidate = await loadCandidate(client, candidateId);
    assertEligibleCandidate(enrichedCandidate, config, controlled);
    let evidence = dossier.evidence.map(toEvidenceSnapshot);
    let evidenceHash = dossier.evidenceHash;
    if (!evidence.length || !evidenceHash) {
      const rows = await loadEditorialEvidenceRows(client, candidateId, config.maximumChunksPerDocument);
      const selection = selectEditorialEvidence(rows, config, minimumDomains);
      if (selection.blockedReason || !selection.evidenceHash) {
        const blocked = await client.editorialSourceDossier.update({
          where: { id: dossier.id },
          data: {
            status: 'BLOCKED',
            error: selection.blockedReason,
            sourceDomains: selection.domains,
            selectedDomainCount: selection.domains.length,
            leaseExpiresAt: null,
            completedAt: new Date(),
            metrics: { enrichment } as unknown as Prisma.InputJsonValue,
          },
          include: { evidence: true, brief: true },
        });
        return { ...persistedResult(blocked, 'BLOCKED'), reason: selection.blockedReason };
      }
      evidence = selection.evidence;
      evidenceHash = selection.evidenceHash;
      await client.$transaction(async (transaction) => {
        await transaction.editorialBriefEvidence.deleteMany({ where: { dossierId: dossier!.id } });
        await transaction.editorialBriefEvidence.createMany({
          data: evidence.map((item) => ({ ...item, dossierId: dossier!.id })),
        });
        await transaction.editorialSourceDossier.update({
          where: { id: dossier!.id },
          data: {
            status: 'EVIDENCE_READY',
            evidenceHash,
            evidenceFrozenAt: new Date(),
            sourceDomains: selection.domains,
            selectedDocumentCount: new Set(evidence.map((item) => item.documentId)).size,
            selectedDomainCount: selection.domains.length,
            selectedChunkCount: evidence.length,
          },
        });
      });
    }

    const generated = await generator.generate({
      topicLabel: enrichedCandidate.topic.label,
      riskLevel: enrichedCandidate.riskLevel,
      evidence,
    });
    const draft = validateEditorialBriefDraft(
      generated.draft,
      new Set(evidence.map((item) => item.evidenceKey)),
      evidence,
    );
    const structuredContent = buildAuditableBriefContent({
      draft,
      topicLabel: enrichedCandidate.topic.label,
      dossierId: dossier.id,
      candidateId,
      evidenceHash,
      promptVersion: EDITORIAL_BRIEF_PROMPT_VERSION,
      generatorModel: generator.model,
      evidence,
    });
    const contentHash = createHash('sha256').update(JSON.stringify(structuredContent)).digest('hex');
    await client.$transaction(async (transaction) => {
      await transaction.editorialBrief.upsert({
        where: { dossierId: dossier!.id },
        create: {
          dossierId: dossier!.id,
          schemaVersion: EDITORIAL_BRIEF_SCHEMA_VERSION,
          promptVersion: EDITORIAL_BRIEF_PROMPT_VERSION,
          generatorModel: generator.model,
          structuredContent: structuredContent as unknown as Prisma.InputJsonValue,
          contentHash,
          inputTokens: generated.inputTokens,
          outputTokens: generated.outputTokens,
          estimatedCostMicros: generated.estimatedCostMicros,
          shadowOnly: true,
        },
        update: {
          structuredContent: structuredContent as unknown as Prisma.InputJsonValue,
          contentHash,
          inputTokens: generated.inputTokens,
          outputTokens: generated.outputTokens,
          estimatedCostMicros: generated.estimatedCostMicros,
        },
      });
      await transaction.editorialSourceDossier.update({
        where: { id: dossier!.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          leaseExpiresAt: null,
          error: null,
          metrics: {
            evidenceChunks: evidence.length,
            inputTokens: generated.inputTokens,
            outputTokens: generated.outputTokens,
            estimatedCostMicros: generated.estimatedCostMicros,
            enrichment,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });
    editorialBriefLog.info('Editorial factual brief completed in shadow mode', {
      dossierId: dossier.id,
      candidateId,
      evidenceChunks: evidence.length,
      domains: new Set(evidence.map((item) => item.domain)).size,
      estimatedCostMicros: generated.estimatedCostMicros,
    });
    return {
      dossierId,
      candidateId,
      outcome: 'COMPLETED',
      evidenceCount: evidence.length,
      domainCount: new Set(evidence.map((item) => item.domain)).size,
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens,
      estimatedCostMicros: generated.estimatedCostMicros,
    };
  } catch (error) {
    await client.editorialSourceDossier.update({
      where: { id: dossierId },
      data: { status: 'FAILED', leaseExpiresAt: null, error: errorMessage(error).slice(0, 1_000) },
    }).catch(() => undefined);
    throw error;
  }
}

export async function runEditorialBriefBatch(
  client: PrismaClient,
  editorialRunId: string,
  options: { config?: Partial<EditorialBriefConfig>; generator?: EditorialBriefGenerator; prodShadowControlled?: boolean } = {},
): Promise<EditorialBriefBatchResult> {
  const startedAt = Date.now();
  const controlled = options.prodShadowControlled === true;
  const config = resolveEditorialBriefConfig({ ...options.config, prodShadowControlled: controlled });
  const selected = await selectEditorialCandidates(client, editorialRunId, { ...config, prodShadowControlled: controlled });
  const results: EditorialDossierResult[] = [];
  const errors: Error[] = [];
  for (const candidate of selected) {
    try {
      results.push(await buildEditorialSourceDossier(client, candidate.candidateId, candidate.rank, {
        config,
        generator: options.generator,
        prodShadowControlled: controlled,
      }));
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (errors.length) {
    throw new Error(`${errors.length} editorial briefs failed: ${errors.map((error) => error.message).join('; ')}`);
  }
  return {
    editorialRunId,
    selectedCandidates: selected.length,
    completed: results.filter((result) => result.outcome === 'COMPLETED').length,
    alreadyCompleted: results.filter((result) => result.outcome === 'ALREADY_COMPLETED').length,
    blocked: results.filter((result) => result.outcome.endsWith('BLOCKED')).length,
    evidenceChunks: results.reduce((sum, result) => sum + result.evidenceCount, 0),
    durationMs: Date.now() - startedAt,
    results,
    selectionDiagnostics: selected.length === 0
      ? [controlled ? 'join_mismatch' : 'unknown']
      : results.flatMap((result) => {
        if (result.reason === 'No eligible evidence chunks') return ['no_chunks'];
        if (result.outcome === 'ALREADY_COMPLETED') return ['already_completed', 'source_dossier_exists'];
        return [];
      }),
  };
}

async function loadCandidate(client: PrismaClient, candidateId: string): Promise<CandidateRecord> {
  const candidate = await client.editorialCandidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      editorialScore: true,
      riskLevel: true,
      shadowOnly: true,
      status: true,
      topic: { select: {
        id: true,
        label: true,
        runId: true,
        independentDomainCount: true,
        documentCount: true,
        representativeDocumentId: true,
        latestEventAt: true,
      } },
    },
  });
  if (!candidate) throw new Error(`Editorial candidate not found: ${candidateId}`);
  return candidate;
}

function assertEligibleCandidate(candidate: CandidateRecord, config: EditorialBriefConfig, controlled = false): void {
  if (!candidate.shadowOnly || candidate.status !== 'SHADOW_PROPOSED') {
    throw new Error('Only shadow-proposed editorial candidates can produce a source dossier');
  }
  if (!controlled && candidate.editorialScore < config.minimumEditorialScore) {
    throw new Error('Editorial candidate score is below the configured minimum');
  }
}

function requiredDomains(riskLevel: EditorialRiskLevel, config: EditorialBriefConfig): number {
  return riskLevel === 'HIGH' ? config.highRiskMinimumDomains : config.minimumDomains;
}

function candidateSnapshot(candidate: CandidateRecord) {
  return {
    candidateId: candidate.id,
    editorialScore: candidate.editorialScore,
    riskLevel: candidate.riskLevel,
    topicId: candidate.topic.id,
    topicLabel: candidate.topic.label,
    editorialRunId: candidate.topic.runId,
    independentDomainCount: candidate.topic.independentDomainCount,
    documentCount: candidate.topic.documentCount,
    representativeDocumentId: candidate.topic.representativeDocumentId,
    latestEventAt: candidate.topic.latestEventAt.toISOString(),
  };
}

function toEvidenceSnapshot(item: {
  evidenceKey: string; documentId: string; chunkId: string; role: 'PRIMARY' | 'CONTEXT';
  position: number; similarity: number; documentTitle: string; canonicalUrl: string;
  domain: string; publishedAt: Date | null; chunkPosition: number; contentSnapshot: string;
  contentHash: string;
}): EditorialEvidenceSnapshot {
  return { ...item };
}

function persistedResult(
  dossier: {
    id: string; candidateId: string; selectedChunkCount: number; selectedDomainCount: number;
    brief: null | { inputTokens: number | null; outputTokens: number | null; estimatedCostMicros: number | null };
  },
  outcome: EditorialDossierResult['outcome'],
): EditorialDossierResult {
  return {
    dossierId: dossier.id,
    candidateId: dossier.candidateId,
    outcome,
    evidenceCount: dossier.selectedChunkCount,
    domainCount: dossier.selectedDomainCount,
    inputTokens: dossier.brief?.inputTokens ?? null,
    outputTokens: dossier.brief?.outputTokens ?? null,
    estimatedCostMicros: dossier.brief?.estimatedCostMicros ?? null,
  };
}

function boundedNumber(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
}

function boundedInteger(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
