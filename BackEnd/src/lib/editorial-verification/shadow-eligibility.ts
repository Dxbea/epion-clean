import type { EditorialShadowPublicationDecision, EditorialVerificationStatus } from '@prisma/client';

export const EDITORIAL_SHADOW_POLICY_VERSION = 'editorial-auto-publish-shadow-v1';

export interface EditorialShadowEligibilityInput {
  verificationStatus: EditorialVerificationStatus;
  articleStatus: string;
  factCheckScore: number | null;
  qualityScore: number;
  publishabilityScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  categorySlug?: string | null;
  topicLabel: string;
  independentDomains: number;
  sourceCount: number;
  mistralPassed: boolean;
  contradictionCount: number;
  gateReasons: string[];
}

export interface EditorialShadowEligibilityResult {
  decision: EditorialShadowPublicationDecision;
  policyVersion: string;
  reasons: string[];
}

const REJECTION_REASONS = new Set([
  'MISTRAL_CORE_CLAIM_NOT_SUPPORTED',
  'MISTRAL_CONTRADICTION_PRESENT',
  'MISTRAL_INVALID_SOURCE_OR_CITATION',
  'CORE_CLAIM_ONLY_METADATA_EVIDENCE',
]);

const SENSITIVE_TERMS = [
  'santé', 'health', 'élection', 'election', 'guerre', 'war', 'finance', 'marché',
  'market', 'investissement', 'accusation', 'fraude', 'terrorisme', 'terrorism',
];

export function calculateEditorialShadowEligibility(
  input: EditorialShadowEligibilityInput,
): EditorialShadowEligibilityResult {
  const reasons: string[] = [];
  if (input.articleStatus !== 'DRAFT') reasons.push('ARTICLE_NOT_DRAFT');
  if (input.gateReasons.some((reason) => REJECTION_REASONS.has(reason))) reasons.push('FUNDAMENTAL_EVIDENCE_FAILURE');
  if (input.contradictionCount > 0) reasons.push('CONTRADICTIONS_PRESENT');
  if (input.factCheckScore !== null && input.factCheckScore < 65) reasons.push('FACT_SCORE_REJECT_THRESHOLD');
  if (input.qualityScore < 70 || input.publishabilityScore < 70) reasons.push('QUALITY_REJECT_THRESHOLD');
  if (reasons.length > 0) return result('WOULD_REJECT', reasons);

  const autoReasons: string[] = [];
  if (input.verificationStatus !== 'PASSED') autoReasons.push('VERIFICATION_NOT_PASSED');
  if (input.factCheckScore === null || input.factCheckScore < 85) autoReasons.push('FACT_SCORE_BELOW_AUTO_THRESHOLD');
  if (input.qualityScore < 85) autoReasons.push('QUALITY_BELOW_AUTO_THRESHOLD');
  if (input.publishabilityScore < 85) autoReasons.push('PUBLISHABILITY_BELOW_AUTO_THRESHOLD');
  if (input.riskLevel !== 'LOW') autoReasons.push('RISK_NOT_LOW');
  if (!input.mistralPassed) autoReasons.push('MISTRAL_NOT_PASSED');
  if (input.independentDomains < 3) autoReasons.push('INSUFFICIENT_AUTO_DIVERSITY');
  if (input.sourceCount < 3) autoReasons.push('INSUFFICIENT_AUTO_SOURCES');
  if (isSensitive(input.categorySlug, input.topicLabel)) autoReasons.push('SENSITIVE_TOPIC');
  return autoReasons.length === 0
    ? result('WOULD_AUTO_PUBLISH', ['ALL_SHADOW_AUTO_GATES_PASSED'])
    : result('WOULD_REQUIRE_HUMAN', autoReasons);
}

function isSensitive(categorySlug: string | null | undefined, topicLabel: string): boolean {
  const value = `${categorySlug ?? ''} ${topicLabel}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return SENSITIVE_TERMS.some((term) => value.includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
}

function result(
  decision: EditorialShadowPublicationDecision,
  reasons: string[],
): EditorialShadowEligibilityResult {
  return { decision, policyVersion: EDITORIAL_SHADOW_POLICY_VERSION, reasons: [...new Set(reasons)] };
}
