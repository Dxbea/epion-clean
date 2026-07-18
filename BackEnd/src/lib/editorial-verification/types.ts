import type { EditorialClaimImportance, EditorialClaimVerdict } from '@prisma/client';
import type { SourceScoreEntry } from '../score-types.js';

export const EDITORIAL_VERIFICATION_VERSION = 'editorial-verification-v1';
export const EDITORIAL_MISTRAL_PROMPT_VERSION = 'editorial-mistral-audit-v1';

export class RetryableEditorialVerificationDependencyError extends Error {
  constructor(readonly dependency: 'SERPER' | 'MISTRAL' | 'OPENAI', message: string) {
    super(message);
    this.name = 'RetryableEditorialVerificationDependencyError';
  }
}

export type EditorialSerperReason =
  | 'MISSING_PRIMARY_SOURCE'
  | 'MISSING_COUNTERPOINT'
  | 'INSUFFICIENT_DOMAIN_DIVERSITY'
  | 'INSUFFICIENT_CLAIM_COVERAGE'
  | 'RECENT_TOPIC_REQUIRES_REFRESH';

export type EditorialEvidenceLane = 'PRIMARY' | 'COUNTERPOINT' | 'CONTEXT';

export interface EditorialVerificationEvidence {
  evidenceKey: string;
  documentId: string;
  sourceId: string | null;
  url: string;
  title: string;
  domain: string;
  content: string;
  publishedAt: Date | null;
  lane: EditorialEvidenceLane;
  origin: 'CORPUS' | 'SERPER';
  query?: string;
  officialStatement?: boolean;
  extractionStatus?: 'full' | 'metadata_only';
}

export interface EditorialClaimForAudit {
  claimKey: string;
  text: string;
  importance: EditorialClaimImportance;
  primaryVerdict: EditorialClaimVerdict;
  evidenceKeys: string[];
}

export interface EditorialCorpusAssessment {
  sufficient: boolean;
  reasons: EditorialSerperReason[];
  independentDomains: number;
  requiredDomains: number;
  claimCoverage: number;
  hasPrimarySource: boolean;
  hasCounterpoint: boolean;
  recentTopic: boolean;
}

export interface EditorialMistralClaimAudit {
  claimKey: string;
  verdict: EditorialClaimVerdict;
  evidenceKeys: string[];
  citationValid: boolean;
  contradiction: boolean;
  agreesWithPrimary: boolean;
  explanation: string;
}

export interface EditorialMistralAuditResult {
  outcome: 'PASSED' | 'HUMAN_REVIEW_REQUIRED';
  available: boolean;
  validJson: boolean;
  model: string;
  claims: EditorialMistralClaimAudit[];
  contradictions: string[];
  invalidEvidenceKeys: string[];
  reasons: string[];
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostMicros: number | null;
}

export interface EditorialMistralAuditor {
  readonly model: string;
  audit(input: {
    title: string;
    summary: string;
    contentHtml: string;
    claims: EditorialClaimForAudit[];
    evidence: EditorialVerificationEvidence[];
  }): Promise<EditorialMistralAuditResult>;
}

export interface EditorialVerificationSourceHydrator {
  hydrate(evidence: EditorialVerificationEvidence, index: number): Promise<SourceScoreEntry>;
}

export interface EditorialVerificationResult {
  runId: string;
  draftId: string;
  revisionId: string;
  articleId: string;
  outcome: 'FINALIZED' | 'HUMAN_REVIEW_REQUIRED' | 'ALREADY_FINALIZED';
  serperRequired: boolean;
  serperDocuments: number;
  mistralReasons: string[];
  factCheckScore: number | null;
}
