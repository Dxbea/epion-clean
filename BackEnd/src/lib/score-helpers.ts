/**
 * score-helpers.ts — Centralized score computation & normalization for Epion
 *
 * This module is the SINGLE source of truth for score calculations.
 * Workers, routes, and API responses MUST use these helpers.
 * The frontend MUST NOT recalculate scores — it reads what the backend provides.
 *
 * Key design decisions:
 *   - Article and Chat share the same weighting (0.75 source / 0.25 content)
 *     but measure different things (live-analysis vs output-quality).
 *   - Chat fast mode WITHOUT sources returns score=null / supportLevel='unsourced'.
 *   - factCheckScore (Int) and factCheckData.score are always written together.
 *   - contentHash covers title + summary + content + source domains.
 */

import { createHash } from 'crypto';
import type {
  SupportLevel,
  ScoreStatus,
  ArticleScorePayload,
  ArticleScoreCalculation,
  AnswerScorePayload,
  AnswerScoreCalculation,
  SourceScoreEntry,
} from './score-types';

// ---------------------------------------------------------------------------
//  Support Level derivation
// ---------------------------------------------------------------------------

const SUPPORT_THRESHOLDS: { min: number; level: SupportLevel }[] = [
  { min: 90, level: 'very_strong' },
  { min: 70, level: 'strong' },
  { min: 50, level: 'nuanced' },
  { min: 30, level: 'fragile' },
  { min: 0, level: 'unverified' },
];

/**
 * Convert a 0-100 numeric score to a human-readable support level.
 * This is NOT a truth probability — it indicates how well content is
 * supported by available sources and analysis methodology.
 */
export function deriveSupportLevel(score: number | null): SupportLevel | 'unsourced' {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return 'unsourced';
  }
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  for (const threshold of SUPPORT_THRESHOLDS) {
    if (clamped >= threshold.min) return threshold.level;
  }
  return 'unverified';
}

// ---------------------------------------------------------------------------
//  Score computation
// ---------------------------------------------------------------------------

const SOURCE_WEIGHT = 0.75;
const CONTENT_WEIGHT = 0.25;

/**
 * Compute the final article FactScore.
 * Formula: sourcesMean × 0.75 + contentScore × 0.25
 *
 * @param sourcesMean  Average trustScore of enriched sources (null if no sources)
 * @param contentScore Live analysis DISARM score (0-100)
 * @returns Clamped 0-100 integer
 */
export function computeArticleScore(
  sourcesMean: number | null,
  contentScore: number,
): number {
  if (sourcesMean === null || sourcesMean === undefined) {
    // No valid sources — contentScore is the only signal
    return clampScore(contentScore);
  }
  return clampScore(Math.round(sourcesMean * SOURCE_WEIGHT + contentScore * CONTENT_WEIGHT));
}

/**
 * Compute the final chat AnswerScore.
 *
 * - Web mode: sourcesMean × 0.75 + outputScore × 0.25
 * - Fast mode WITH RAG chunks: outputScore only
 * - Fast mode WITHOUT RAG chunks: null (unsourced)
 */
export function computeAnswerScore(
  sourcesMean: number,
  outputScore: number,
  mode: 'fast' | 'web',
  hasRagChunks: boolean = false,
): { score: number | null; formula: AnswerScoreCalculation['formula'] } {
  if (mode === 'web') {
    return {
      score: clampScore(Math.round(sourcesMean * SOURCE_WEIGHT + outputScore * CONTENT_WEIGHT)),
      formula: 'weighted-source-output-v1',
    };
  }

  // Fast mode
  if (hasRagChunks) {
    return {
      score: clampScore(outputScore),
      formula: 'output-only-v1',
    };
  }

  // Fast mode without RAG chunks → unsourced
  return {
    score: null,
    formula: 'unsourced',
  };
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ---------------------------------------------------------------------------
//  Content hash
// ---------------------------------------------------------------------------

/**
 * Generate a SHA-256 hash of the analysis input for invalidation detection.
 * Covers: title + summary + content + sorted source domains.
 *
 * When an article is modified and the hash changes, the existing score
 * becomes 'stale' and should be re-analyzed.
 */
export function hashAnalysisInput(input: {
  title: string;
  summary?: string | null;
  content?: string | null;
  sourceDomains?: string[];
}): string {
  const parts = [
    input.title ?? '',
    input.summary ?? '',
    input.content ?? '',
    ...(input.sourceDomains ?? []).sort(),
  ];
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}

// ---------------------------------------------------------------------------
//  Payload builders (write-time)
// ---------------------------------------------------------------------------

/**
 * Build a complete ArticleScorePayload (v1) for writing to factCheckData.
 * This helper ensures factCheckScore and factCheckData.score are always in sync.
 *
 * @returns { factCheckScore, factCheckData } — both fields to write to Prisma.
 */
export function buildArticleScorePayload(params: {
  sourcesMean: number | null;
  contentScore: number;
  contentHash: string;
  sources: SourceScoreEntry[];
  liveAnalysis: unknown | null;
}): { factCheckScore: number; factCheckData: ArticleScorePayload } {
  const finalScore = computeArticleScore(params.sourcesMean, params.contentScore);
  const supportLevel = deriveSupportLevel(finalScore) as SupportLevel;

  const payload: ArticleScorePayload = {
    version: 1,
    status: 'COMPLETED',
    score: finalScore,
    supportLevel,
    calculation: {
      formula: 'weighted-source-live-v1',
      sourceWeight: SOURCE_WEIGHT,
      contentWeight: CONTENT_WEIGHT,
      sourcesMean: params.sourcesMean,
      contentScore: params.contentScore,
      finalScore,
    },
    analyzedAt: new Date().toISOString(),
    contentHash: params.contentHash,
    sources: params.sources,
    liveAnalysis: params.liveAnalysis,
  };

  return {
    factCheckScore: finalScore,
    factCheckData: payload,
  };
}

/**
 * Build a complete AnswerScorePayload (v1) for writing to ChatMessage.metadata.
 */
export function buildAnswerScorePayload(params: {
  sourcesMean: number;
  outputScore: number;
  mode: 'fast' | 'web';
  hasRagChunks?: boolean;
  outputAnalysis: unknown | null;
}): AnswerScorePayload {
  const { score, formula } = computeAnswerScore(
    params.sourcesMean,
    params.outputScore,
    params.mode,
    params.hasRagChunks ?? false,
  );
  const supportLevel = score !== null ? deriveSupportLevel(score) as SupportLevel : 'unsourced';

  return {
    version: 1,
    score,
    supportLevel,
    mode: params.mode,
    calculation: {
      formula,
      sourceWeight: params.mode === 'web' ? SOURCE_WEIGHT : 0,
      outputWeight: params.mode === 'web' ? CONTENT_WEIGHT : 1,
      sourcesMean: params.sourcesMean,
      outputScore: params.outputScore,
      finalScore: score ?? 0,
    },
    outputAnalysis: params.outputAnalysis,
  };
}

// ---------------------------------------------------------------------------
//  Legacy normalization (read-time)
// ---------------------------------------------------------------------------

/**
 * Normalize a raw factCheckData blob (any legacy format) into ArticleScorePayload v1.
 * This is used at READ time to ensure the API always returns a consistent payload.
 *
 * The DB field Article.factCheckStatus is the source of truth for status.
 * If it diverges from the payload's internal status, the DB field wins.
 */
export function normalizeArticleScorePayload(
  raw: unknown,
  dbFactCheckScore: number | null,
  dbFactCheckStatus: string | null,
): ArticleScorePayload | null {
  if (!raw || typeof raw !== 'object') return null;

  const data = raw as Record<string, any>;

  // Already v1 format
  if (data.version === 1) {
    const payload = data as ArticleScorePayload;
    // DB fields are source of truth — override payload snapshot if divergent
    if (dbFactCheckStatus) {
      payload.status = dbFactCheckStatus as ScoreStatus;
    }
    if (typeof dbFactCheckScore === 'number') {
      payload.score = dbFactCheckScore;
      payload.supportLevel = deriveSupportLevel(dbFactCheckScore) as SupportLevel;
    }
    return payload;
  }

  // Legacy format: { factScore, calculation, sources, liveAnalysis, enrichedAt, sourcesMean, liveScore }
  const score = typeof dbFactCheckScore === 'number'
    ? dbFactCheckScore
    : data.factScore ?? data.calculation?.finalScore ?? 50;

  const status: ScoreStatus = (dbFactCheckStatus as ScoreStatus) || 'COMPLETED';

  return {
    version: 1,
    status,
    score,
    supportLevel: deriveSupportLevel(score) as SupportLevel,
    calculation: {
      formula: 'weighted-source-live-v1',
      sourceWeight: SOURCE_WEIGHT,
      contentWeight: CONTENT_WEIGHT,
      sourcesMean: data.calculation?.sourcesMean ?? data.sourcesMean ?? null,
      contentScore: data.calculation?.liveScore ?? data.liveScore ?? 0,
      finalScore: score,
    },
    analyzedAt: data.enrichedAt ?? data.analyzedAt ?? new Date().toISOString(),
    contentHash: data.contentHash ?? '',
    sources: data.sources ?? [],
    liveAnalysis: data.liveAnalysis ?? null,
  };
}

/**
 * Normalize a raw ChatMessage.metadata blob into AnswerScorePayload v1.
 */
export function normalizeAnswerScorePayload(
  raw: unknown,
): AnswerScorePayload | null {
  if (!raw || typeof raw !== 'object') return null;

  const data = raw as Record<string, any>;

  // Already v1
  if (data.version === 1) return data as AnswerScorePayload;

  // Legacy format: { factScore, mode, calculation: { sourcesMean, outputScore, formula } }
  const score = typeof data.factScore === 'number' ? data.factScore : null;
  const mode = data.mode === 'fast' ? 'fast' : 'web';

  return {
    version: 1,
    score,
    supportLevel: score !== null ? deriveSupportLevel(score) as SupportLevel : 'unsourced',
    mode: mode as 'fast' | 'web',
    calculation: {
      formula: data.calculation?.formula ?? (mode === 'web' ? 'weighted-source-output-v1' : 'output-only-v1'),
      sourceWeight: data.calculation?.sourceWeight ?? (mode === 'web' ? SOURCE_WEIGHT : 0),
      outputWeight: data.calculation?.outputWeight ?? (mode === 'web' ? CONTENT_WEIGHT : 1),
      sourcesMean: data.calculation?.sourcesMean ?? 0,
      outputScore: data.calculation?.outputScore ?? 0,
      finalScore: score ?? 0,
    },
    outputAnalysis: data.outputAnalysis ?? null,
  };
}
