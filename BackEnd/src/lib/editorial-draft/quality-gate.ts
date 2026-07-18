import type { EditorialRiskLevel } from '@prisma/client';
import type { EditorialEvidenceSnapshot } from '../editorial-brief/types.js';
import type { EditorialClaimReview, EditorialDraftArtifact, EditorialDraftConfig, EditorialQualityGateResult } from './types.js';

export function calculateEditorialQualityGate(input: {
  artifact: EditorialDraftArtifact;
  reviews: EditorialClaimReview[];
  evidence: EditorialEvidenceSnapshot[];
  riskLevel: EditorialRiskLevel;
  config: EditorialDraftConfig;
}): EditorialQualityGateResult {
  const reviews = new Map(input.reviews.map((review) => [review.claimKey, review]));
  const citedClaims = input.artifact.claims.filter((claim) => claim.evidenceKeys.length > 0);
  const citationCoverage = ratio(citedClaims.length, input.artifact.claims.length);
  const supportValue = (claimKey: string) => {
    const verdict = reviews.get(claimKey)?.verdict;
    return verdict === 'SUPPORTED' ? 1 : verdict === 'PARTIALLY_SUPPORTED' ? 0.5 : 0;
  };
  const supportedClaimRatio = average(input.artifact.claims.map((claim) => supportValue(claim.claimKey)));
  const coreClaims = input.artifact.claims.filter((claim) => claim.importance === 'CORE');
  const coreClaimSupportRatio = coreClaims.length
    ? average(coreClaims.map((claim) => supportValue(claim.claimKey)))
    : 0;
  const citedEvidenceKeys = new Set(input.artifact.claims.flatMap((claim) => claim.evidenceKeys));
  const independentDomains = new Set(input.evidence.filter((item) => citedEvidenceKeys.has(item.evidenceKey)).map((item) => item.domain)).size;
  const requiredDomains = input.riskLevel === 'HIGH' ? input.config.highRiskMinimumDomains : input.config.minimumDomains;
  const structuralScore = input.artifact.sections.length >= 2 && coreClaims.length > 0 ? 1 : 0;
  const diversityScore = Math.min(1, ratio(independentDomains, requiredDomains));
  const qualityScore = round100(
    supportedClaimRatio * 45 + coreClaimSupportRatio * 20 + citationCoverage * 15 + structuralScore * 10 + diversityScore * 10,
  );
  const contradicted = input.reviews.filter((review) => review.verdict === 'CONTRADICTED').length;
  const unsupportedCore = coreClaims.filter((claim) => {
    const verdict = reviews.get(claim.claimKey)?.verdict;
    return verdict !== 'SUPPORTED';
  }).length;
  const publishabilityScore = round100(Math.max(0, qualityScore - contradicted * 15 - unsupportedCore * 20));
  const reasons: string[] = [];
  if (qualityScore < input.config.minimumQualityScore) reasons.push('QUALITY_SCORE_BELOW_THRESHOLD');
  if (publishabilityScore < input.config.minimumPublishabilityScore) reasons.push('PUBLISHABILITY_SCORE_BELOW_THRESHOLD');
  if (citationCoverage < input.config.minimumCitationCoverage) reasons.push('CITATION_COVERAGE_BELOW_THRESHOLD');
  if (supportedClaimRatio < input.config.minimumSupportedClaimRatio) reasons.push('SUPPORTED_CLAIM_RATIO_BELOW_THRESHOLD');
  if (coreClaimSupportRatio < input.config.minimumCoreClaimSupportRatio) reasons.push('CORE_CLAIM_SUPPORT_BELOW_THRESHOLD');
  if (independentDomains < requiredDomains) reasons.push('INSUFFICIENT_INDEPENDENT_DOMAINS');
  if (contradicted > 0) reasons.push('CONTRADICTED_CLAIMS_PRESENT');
  return {
    qualityScore,
    publishabilityScore,
    citationCoverage,
    supportedClaimRatio,
    coreClaimSupportRatio,
    independentDomains,
    automatedDecision: reasons.length ? 'FAILED' : 'PASSED',
    reasons,
    thresholds: input.config,
  };
}

function ratio(value: number, total: number): number { return total ? value / total : 0; }
function average(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function round100(value: number): number { return Math.round(value * 100) / 100; }
