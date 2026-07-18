import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import logger from '../logger.js';
import { DOCUMENT_EMBEDDING_MODEL } from '../document-corpus/document-rag-service.js';
import { clusterEditorialDocuments } from './clustering.js';
import { scoreEditorialCluster } from './scoring.js';
import {
  DEFAULT_EDITORIAL_CLUSTERING_CONFIG,
  EDITORIAL_CLUSTERING_ALGORITHM_VERSION,
  type EditorialClusteringConfig,
  type EditorialDocumentVector,
} from './types.js';

const editorialLog = logger.child({ module: 'EditorialShadow' });
const EXPECTED_EMBEDDING_DIMENSIONS = 1_536;
const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const RUN_LEASE_MS = 15 * 60_000;

interface EditorialDocumentRow {
  id: string;
  title: string | null;
  domain: string;
  language: string | null;
  sourceId: string | null;
  categoryId: string | null;
  eventAt: Date;
  embedding: string;
}

export interface EditorialShadowRunOptions {
  windowStart: Date;
  windowEnd: Date;
  embeddingModel?: string;
  config?: Partial<EditorialClusteringConfig>;
  now?: Date;
}

export interface EditorialShadowRunResult {
  runId: string;
  idempotencyKey: string;
  outcome: 'COMPLETED' | 'ALREADY_COMPLETED';
  documentsConsidered: number;
  topicsCreated: number;
  candidatesCreated: number;
  proposedCandidates: number;
  suppressedCandidates: number;
  quasiDuplicates: number;
  durationMs: number;
}

export class EditorialRunInProgressError extends Error {
  constructor(idempotencyKey: string) {
    super(`Editorial shadow run is already in progress: ${idempotencyKey}`);
    this.name = 'EditorialRunInProgressError';
  }
}

export function resolveEditorialClusteringConfig(
  input: Partial<EditorialClusteringConfig> = {},
): EditorialClusteringConfig {
  const config = { ...DEFAULT_EDITORIAL_CLUSTERING_CONFIG, ...input };
  boundedNumber(config.topicSimilarityThreshold, 0.5, 1, 'topicSimilarityThreshold');
  boundedNumber(config.quasiDuplicateSimilarityThreshold, 0.8, 1, 'quasiDuplicateSimilarityThreshold');
  boundedNumber(config.quasiDuplicateTitleThreshold, 0, 1, 'quasiDuplicateTitleThreshold');
  boundedNumber(config.maxEventGapHours, 1, 168, 'maxEventGapHours');
  boundedInteger(config.minProposalDocuments, 1, 20, 'minProposalDocuments');
  boundedInteger(config.minProposalDomains, 1, 20, 'minProposalDomains');
  boundedNumber(config.proposalScoreThreshold, 0, 100, 'proposalScoreThreshold');
  boundedInteger(config.maxDocuments, 1, 500, 'maxDocuments');
  if (config.quasiDuplicateSimilarityThreshold < config.topicSimilarityThreshold) {
    throw new Error('quasiDuplicateSimilarityThreshold must be at least topicSimilarityThreshold');
  }
  return config;
}

export function buildEditorialRunIdempotencyKey(
  options: Omit<Required<EditorialShadowRunOptions>, 'now'>,
): string {
  const payload = JSON.stringify({
    mode: 'SHADOW',
    algorithmVersion: EDITORIAL_CLUSTERING_ALGORITHM_VERSION,
    embeddingModel: options.embeddingModel,
    windowStart: options.windowStart.toISOString(),
    windowEnd: options.windowEnd.toISOString(),
    config: options.config,
  });
  return createHash('sha256').update(payload).digest('hex');
}

export async function loadIndexedEditorialDocuments(
  client: PrismaClient,
  options: {
    windowStart: Date;
    windowEnd: Date;
    embeddingModel: string;
    maxDocuments: number;
  },
): Promise<EditorialDocumentVector[]> {
  const rows = await client.$queryRaw<EditorialDocumentRow[]>(Prisma.sql`
    SELECT
      d.id,
      d.title,
      d.domain,
      d.language,
      d."sourceId",
      COALESCE(d."publishedAt", d."discoveredAt") AS "eventAt",
      (
        SELECT ds."categoryId"
        FROM "DocumentDiscovery" dd
        JOIN "DiscoverySource" ds ON ds.id = dd."discoverySourceId"
        WHERE dd."documentId" = d.id AND ds."categoryId" IS NOT NULL
        ORDER BY ds.priority DESC, ds.id ASC
        LIMIT 1
      ) AS "categoryId",
      AVG(dc.embedding)::text AS embedding
    FROM "IngestedDocument" d
    JOIN "DocumentChunk" dc ON dc."documentId" = d.id
    WHERE d.status = 'INDEXED'
      AND d."duplicateOfId" IS NULL
      AND dc.embedding IS NOT NULL
      AND dc."embeddingModel" = ${options.embeddingModel}
      AND COALESCE(d."publishedAt", d."discoveredAt") >= ${options.windowStart}
      AND COALESCE(d."publishedAt", d."discoveredAt") < ${options.windowEnd}
    GROUP BY d.id
    ORDER BY "eventAt" DESC, d.id ASC
    LIMIT ${options.maxDocuments}
  `);

  return rows.map((row) => ({
    id: row.id,
    title: row.title?.trim() || `Sujet ${row.domain}`,
    domain: row.domain.toLowerCase(),
    language: row.language?.toLowerCase() ?? null,
    sourceId: row.sourceId,
    categoryId: row.categoryId,
    eventAt: new Date(row.eventAt),
    embedding: parseVector(row.embedding),
  }));
}

export async function runEditorialShadow(
  client: PrismaClient,
  options: EditorialShadowRunOptions,
): Promise<EditorialShadowRunResult> {
  const startedAtMs = Date.now();
  const now = options.now ?? new Date();
  const config = resolveEditorialClusteringConfig(options.config);
  const embeddingModel = options.embeddingModel ?? DOCUMENT_EMBEDDING_MODEL;
  validateEditorialWindow(options.windowStart, options.windowEnd);
  const idempotencyKey = buildEditorialRunIdempotencyKey({
    windowStart: options.windowStart,
    windowEnd: options.windowEnd,
    embeddingModel,
    config,
  });

  await client.editorialRun.createMany({
    data: [{
      idempotencyKey,
      mode: 'SHADOW',
      status: 'PENDING',
      windowStart: options.windowStart,
      windowEnd: options.windowEnd,
      algorithmVersion: EDITORIAL_CLUSTERING_ALGORITHM_VERSION,
      embeddingModel,
      configuration: config as unknown as Prisma.InputJsonValue,
    }],
    skipDuplicates: true,
  });
  let run = await client.editorialRun.findUnique({ where: { idempotencyKey } });
  if (!run) throw new Error(`Unable to resolve editorial run: ${idempotencyKey}`);
  if (run.status === 'COMPLETED') return completedResult(run, 'ALREADY_COMPLETED');

  const leaseExpiresAt = new Date(now.getTime() + RUN_LEASE_MS);
  const claimed = await client.editorialRun.updateMany({
    where: {
      id: run.id,
      OR: [
        { status: { in: ['PENDING', 'FAILED'] } },
        { status: 'RUNNING', leaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      status: 'RUNNING',
      startedAt: now,
      completedAt: null,
      leaseExpiresAt,
      attempts: { increment: 1 },
      error: null,
    },
  });
  if (claimed.count !== 1) {
    run = await client.editorialRun.findUnique({ where: { idempotencyKey } });
    if (run?.status === 'COMPLETED') return completedResult(run, 'ALREADY_COMPLETED');
    throw new EditorialRunInProgressError(idempotencyKey);
  }

  try {
    const documents = await loadIndexedEditorialDocuments(client, {
      windowStart: options.windowStart,
      windowEnd: options.windowEnd,
      embeddingModel,
      maxDocuments: config.maxDocuments,
    });
    const clusters = clusterEditorialDocuments(documents, config);
    const scored = clusters.map((cluster) => ({
      cluster,
      score: scoreEditorialCluster(cluster, options.windowEnd, config),
    }));
    const proposedCandidates = scored.filter(({ score }) =>
      score.status === 'SHADOW_PROPOSED').length;
    const quasiDuplicates = scored.reduce((sum, item) =>
      sum + item.score.quasiDuplicates, 0);
    const durationMs = Date.now() - startedAtMs;
    const metrics = {
      documentsConsidered: documents.length,
      topicsCreated: scored.length,
      candidatesCreated: scored.length,
      proposedCandidates,
      suppressedCandidates: scored.length - proposedCandidates,
      quasiDuplicates,
      durationMs,
    };

    await client.$transaction(async (transaction) => {
      await transaction.editorialTopic.deleteMany({ where: { runId: run.id } });
      for (const { cluster, score } of scored) {
        const topic = await transaction.editorialTopic.create({
          data: {
            runId: run.id,
            clusterKey: cluster.clusterKey,
            label: cluster.label,
            language: cluster.language,
            dominantCategoryId: cluster.dominantCategoryId,
            dominantSourceId: cluster.dominantSourceId,
            representativeDocumentId: cluster.representativeDocumentId,
            centroidModel: embeddingModel,
            documentCount: cluster.members.length,
            independentDomainCount: score.independentDomains,
            firstEventAt: cluster.firstEventAt,
            latestEventAt: cluster.latestEventAt,
            metadata: {
              evidenceDocuments: score.evidenceDocuments,
              quasiDuplicates: score.quasiDuplicates,
              centroidDimensions: cluster.centroid.length,
            },
          },
          select: { id: true },
        });
        const centroidVector = `[${cluster.centroid.join(',')}]`;
        await transaction.$executeRaw`
          UPDATE "EditorialTopic"
          SET "centroidEmbedding" = ${centroidVector}::vector
          WHERE id = ${topic.id}
        `;
        await transaction.editorialTopicDocument.createMany({
          data: cluster.members.map((member) => ({
            topicId: topic.id,
            documentId: member.document.id,
            role: member.role,
            similarityToCentroid: member.similarityToCentroid,
            quasiDuplicateOfDocumentId: member.quasiDuplicateOfDocumentId,
            eventAt: member.document.eventAt,
          })),
        });
        await transaction.editorialCandidate.create({
          data: {
            topicId: topic.id,
            status: score.status,
            editorialScore: score.editorialScore,
            freshnessScore: score.freshnessScore,
            sourceDiversityScore: score.sourceDiversityScore,
            independentDomainScore: score.independentDomainScore,
            coverageScore: score.coverageScore,
            relevanceScore: score.relevanceScore,
            riskScore: score.riskScore,
            riskLevel: score.riskLevel,
            shadowOnly: true,
            rationale: score.rationale,
          },
        });
      }
      await transaction.editorialRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          leaseExpiresAt: null,
          metrics,
        },
      });
    });

    editorialLog.info('Editorial shadow run completed', {
      runId: run.id,
      idempotencyKey,
      ...metrics,
    });
    return {
      runId: run.id,
      idempotencyKey,
      outcome: 'COMPLETED',
      ...metrics,
    };
  } catch (error) {
    await client.editorialRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        leaseExpiresAt: null,
        error: errorMessage(error).slice(0, 1_000),
      },
    }).catch((stateError) => {
      editorialLog.error('Failed to persist editorial shadow run failure', {
        runId: run.id,
        error: errorMessage(stateError),
      });
    });
    throw error;
  }
}

function completedResult(
  run: { id: string; idempotencyKey: string; metrics: Prisma.JsonValue | null },
  outcome: EditorialShadowRunResult['outcome'],
): EditorialShadowRunResult {
  const metrics = jsonRecord(run.metrics);
  return {
    runId: run.id,
    idempotencyKey: run.idempotencyKey,
    outcome,
    documentsConsidered: numberMetric(metrics, 'documentsConsidered'),
    topicsCreated: numberMetric(metrics, 'topicsCreated'),
    candidatesCreated: numberMetric(metrics, 'candidatesCreated'),
    proposedCandidates: numberMetric(metrics, 'proposedCandidates'),
    suppressedCandidates: numberMetric(metrics, 'suppressedCandidates'),
    quasiDuplicates: numberMetric(metrics, 'quasiDuplicates'),
    durationMs: numberMetric(metrics, 'durationMs'),
  };
}

function parseVector(value: string): number[] {
  const normalized = value.trim().replace(/^\[|\]$/g, '');
  const vector = normalized ? normalized.split(',').map(Number) : [];
  if (
    vector.length !== EXPECTED_EMBEDDING_DIMENSIONS ||
    vector.some((component) => !Number.isFinite(component))
  ) {
    throw new Error(`Editorial document embeddings must contain ${EXPECTED_EMBEDDING_DIMENSIONS} dimensions`);
  }
  return vector;
}

export function validateEditorialWindow(windowStart: Date, windowEnd: Date): void {
  if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime())) {
    throw new Error('Editorial shadow window requires valid dates');
  }
  const duration = windowEnd.getTime() - windowStart.getTime();
  if (duration <= 0 || duration > MAX_WINDOW_MS) {
    throw new Error('Editorial shadow window must be greater than zero and at most seven days');
  }
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

function jsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberMetric(metrics: Record<string, unknown>, key: string): number {
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
