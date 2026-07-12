/**
 * score-types.ts — Unified scoring type system for Epion
 *
 * Three distinct score contexts:
 *   - Source   → TrustScore  (domain-level reliability)
 *   - Article  → FactScore   (support level of published content)
 *   - Answer   → AnswerScore (support level of an AI chat response)
 *
 * Labels are internal English keys; the UI layer handles i18n (FR/EN).
 */

import type {
  PublicTrustLabelKey,
  SourceProfileConfidence,
  SourceProfileDataV1,
} from './source-profile.js';
import type {
  ArticleSourceProvenanceValue,
  ArticleSourceRoleValue,
} from './article-source-service.js';
import type { SourceSearchLane } from './live-analysis/types.js';

// ---------------------------------------------------------------------------
//  Enums / Literals
// ---------------------------------------------------------------------------

/** Lifecycle status of a fact-check analysis (matches Prisma FactCheckStatus enum). */
export type ScoreStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STALE';

/**
 * Human-readable support level derived from a 0-100 score.
 * These are INTERNAL keys — the UI maps them to localized labels such as:
 *   very_strong → "Très solide" / "Very strong"
 *   strong      → "Solide" / "Strong"
 *   nuanced     → "À nuancer" / "Nuanced"
 *   fragile     → "Fragile" / "Fragile"
 *   unverified  → "À vérifier" / "Unverified"
 *
 * Important: This is NOT a truth probability.
 * It indicates how well a piece of content is supported by its sources,
 * structure, methodology, and acknowledged limitations.
 */
export type SupportLevel = 'very_strong' | 'strong' | 'nuanced' | 'fragile' | 'unverified';

/** Score context discriminator. */
export type ScoreContext = 'source' | 'article' | 'answer';

export type ArticleLightSupportLevel = 'strong' | 'nuanced' | 'fragile' | 'unverified';
export type ArticleLightAnalysisConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ArticleLightAnalysisV1 {
  version: 1;
  mode: 'light';
  methodVersion: 'article-light-v1';
  analyzedAt: string;
  contentHash: string | null;
  supportLevel: ArticleLightSupportLevel;
  sourceQualitySummary: {
    totalSources: number;
    usableSources: number;
    uniqueDomains: number;
    durableSourceCount: number;
    profiledSourceCount: number;
    metadataOnlyCount: number;
    unavailableCount: number;
    unknownSourceCount: number;
    profileCoverage: number;
  };
  sourceUsageSummary: {
    primaryEvidenceCount: number;
    officialStatementCount: number;
    contextCount: number;
    counterpointCount: number;
    backgroundCount: number;
    unknownRoleCount: number;
    hasPrimaryEvidence: boolean;
    domainDiversity: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  limitations: string[];
  uncertainties: string[];
  analysisConfidence: ArticleLightAnalysisConfidence;
  /**
   * General product availability only. This is not an entitlement decision and does not
   * authorize billing, consume credits, or confirm that a deep-analysis service is healthy.
   */
  deepAnalysisAvailable: true;
  /** Advisory signal from the light evaluator; it does not make deep analysis mandatory. */
  deepAnalysisRecommended: boolean;
  /** @deprecated Use deepAnalysisRecommended. Kept temporarily for additive API compatibility. */
  requiresDeepAnalysis: boolean;
  deepAnalysisReasons: string[];
}

// ---------------------------------------------------------------------------
//  Article FactScore Payload  (stored in Article.factCheckData)
// ---------------------------------------------------------------------------

export interface ArticleScoreCalculation {
  formula: 'weighted-source-live-v1';
  sourceWeight: number;   // 0.75
  contentWeight: number;  // 0.25
  sourcesMean: number | null;
  contentScore: number;   // live analysis score
  finalScore: number;
}

export interface ArticleScorePayload {
  version: 1;
  status: ScoreStatus;
  score: number;                        // 0-100 final (== Article.factCheckScore)
  supportLevel: SupportLevel;
  calculation: ArticleScoreCalculation;
  analyzedAt: string;                   // ISO 8601
  contentHash: string;                  // SHA-256 of analysis input (title+summary+content+domains)
  sources: SourceScoreEntry[];
  liveAnalysis: unknown | null;         // DISARM pipeline result
}

// ---------------------------------------------------------------------------
//  Chat AnswerScore Payload  (stored in ChatMessage.metadata)
// ---------------------------------------------------------------------------

export interface AnswerScoreCalculation {
  formula: 'weighted-source-output-v1' | 'output-only-v1' | 'unsourced';
  sourceWeight: number;
  outputWeight: number;
  sourcesMean: number;
  outputScore: number;
  finalScore: number;
}

export interface AnswerScorePayload {
  version: 1;
  score: number | null;                 // null when unsourced (fast mode without RAG)
  supportLevel: SupportLevel | 'unsourced';
  mode: 'fast' | 'web';
  calculation: AnswerScoreCalculation;
  outputAnalysis: unknown | null;
}

// ---------------------------------------------------------------------------
//  Source entry inside a score payload
// ---------------------------------------------------------------------------

export interface SourceScoreMetrics {
  transparency: number;
  editorial: number;
  semantic: number;
  logic: number;                        // maps to pluralism in Source model
}

export interface SourceScoreFlags {
  isPlatform?: boolean;
  hasFactCheckFailures?: boolean;
  isAdsTxtValid?: boolean;
  isOwnerPublic?: boolean;
}

export type SourceAnalysisStatus = 'ANALYZED' | 'METADATA_ONLY' | 'UNAVAILABLE' | 'PENDING';

export interface SourceScoreEntry {
  id: number;
  sourceId?: string;
  durableSourceId?: string;
  domain: string;
  name: string;
  url: string;
  trustScore: number;
  type: string;
  logo: string;
  description: string | null;
  justification: string | null;
  metrics: SourceScoreMetrics | null;
  flags: SourceScoreFlags | null;
  analysisStatus?: SourceAnalysisStatus;
  extractionStatus?: 'full' | 'metadata_only' | 'failed';
  provider?: 'web' | 'rag';
  searchLane?: SourceSearchLane;
  role?: ArticleSourceRoleValue;
  provenance?: ArticleSourceProvenanceValue;
  officialStatement?: boolean;
  profileData?: SourceProfileDataV1 | null;
  profileVersion?: number | null;
  profileConfidence?: SourceProfileConfidence | null;
  lastProfiledAt?: string | null;
  publicTrustLabel?: PublicTrustLabelKey | null;
  metadata: {
    reliability?: string;
    dbScore?: number;
    politicalBias?: string;
    biasScore?: number;
    country?: string;
    explanation?: {
      formula: string;
      range: string;
      qualityCursor: string;
      penalties: string[];
    };
    [key: string]: unknown;
  };
}
