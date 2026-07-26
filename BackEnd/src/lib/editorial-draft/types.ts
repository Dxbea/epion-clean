import type { EditorialClaimImportance, EditorialClaimVerdict, EditorialRiskLevel } from '@prisma/client';
import type { EditorialBriefContent, EditorialEvidenceSnapshot } from '../editorial-brief/types.js';
import type { EvidenceDossier } from '../article-generation-core/types.js';

export const EDITORIAL_DRAFT_VERSION = 'controlled-draft-v1';
export const EDITORIAL_DRAFT_PROMPT_VERSION = 'editorial-draft-v3';
export const EDITORIAL_CRITIC_PROMPT_VERSION = 'claim-critic-v2';
export const EDITORIAL_QUALITY_GATE_VERSION = 'quality-gate-v2';

export interface EditorialDraftConfig {
  minimumQualityScore: number;
  minimumPublishabilityScore: number;
  minimumCitationCoverage: number;
  minimumSupportedClaimRatio: number;
  minimumCoreClaimSupportRatio: number;
  minimumDomains: number;
  highRiskMinimumDomains: number;
  maximumClaims: number;
}

export const DEFAULT_EDITORIAL_DRAFT_CONFIG: EditorialDraftConfig = {
  minimumQualityScore: 80,
  minimumPublishabilityScore: 80,
  minimumCitationCoverage: 1,
  minimumSupportedClaimRatio: 0.9,
  minimumCoreClaimSupportRatio: 1,
  minimumDomains: 2,
  highRiskMinimumDomains: 3,
  maximumClaims: 24,
};

export interface EditorialDraftClaimInput {
  claimKey: string;
  text: string;
  importance: EditorialClaimImportance;
  evidenceKeys: string[];
}

export interface EditorialDraftArtifact {
  title: string;
  titleClaimKeys: string[];
  summary: string;
  summaryClaimKeys: string[];
  sections: Array<{ heading: string; claimKeys: string[] }>;
  claims: EditorialDraftClaimInput[];
}

export interface EditorialClaimReview {
  claimKey: string;
  verdict: EditorialClaimVerdict;
  explanation: string;
  evidenceKeys: string[];
}

export interface EditorialDraftGenerationResult {
  artifact: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostMicros: number | null;
}

export interface EditorialCriticResult {
  reviews: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostMicros: number | null;
}

export interface EditorialDraftGenerator {
  readonly model: string;
  generate(input: {
    brief: EditorialBriefContent;
    riskLevel: EditorialRiskLevel;
    evidence: EditorialEvidenceSnapshot[];
    evidenceDossier: EvidenceDossier;
  }): Promise<EditorialDraftGenerationResult>;
  repair?(input: {
    brief: EditorialBriefContent;
    riskLevel: EditorialRiskLevel;
    evidence: EditorialEvidenceSnapshot[];
    evidenceDossier: EvidenceDossier;
    artifact: unknown;
    validationError: string;
  }): Promise<EditorialDraftGenerationResult>;
}

export interface EditorialClaimCritic {
  readonly model: string;
  review(input: {
    claims: EditorialDraftClaimInput[];
    evidence: EditorialEvidenceSnapshot[];
  }): Promise<EditorialCriticResult>;
}

export interface EditorialQualityGateResult {
  qualityScore: number;
  publishabilityScore: number;
  citationCoverage: number;
  supportedClaimRatio: number;
  coreClaimSupportRatio: number;
  independentDomains: number;
  automatedDecision: 'PASSED' | 'FAILED';
  reasons: string[];
  thresholds: EditorialDraftConfig;
}
