import type { EditorialBriefContent } from '../editorial-brief/types.js';
import type {
  EditorialClaimForAudit,
  EditorialCorpusAssessment,
  EditorialVerificationEvidence,
} from './types.js';

const RECENT_TOPIC_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MINIMUM_CLAIM_COVERAGE = 0.9;

export function assessEditorialCorpus(input: {
  brief: EditorialBriefContent;
  claims: EditorialClaimForAudit[];
  evidence: EditorialVerificationEvidence[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  latestEventAt: Date;
  recentRefreshPerformed?: boolean;
  now?: Date;
}): EditorialCorpusAssessment {
  const now = input.now ?? new Date();
  const requiredDomains = input.riskLevel === 'HIGH' ? 3 : 2;
  const independentDomains = new Set(input.evidence.map((item) => normalizeDomain(item.domain)).filter(Boolean)).size;
  const evidenceKeys = new Set(input.evidence.map((item) => item.evidenceKey));
  const coveredClaims = input.claims.filter((claim) =>
    claim.evidenceKeys.some((key) => evidenceKeys.has(key)));
  const claimCoverage = input.claims.length ? coveredClaims.length / input.claims.length : 0;
  const hasPrimarySource = input.evidence.some((item) => item.lane === 'PRIMARY' || item.officialStatement === true);
  const hasCounterpoint = hasBriefCounterpoint(input.brief, input.evidence) || input.evidence.some((item) => item.lane === 'COUNTERPOINT');
  const eventAge = now.getTime() - input.latestEventAt.getTime();
  const recentTopic = Number.isFinite(eventAge) && eventAge >= 0 && eventAge <= RECENT_TOPIC_WINDOW_MS;
  const reasons: EditorialCorpusAssessment['reasons'] = [];
  if (!hasPrimarySource) reasons.push('MISSING_PRIMARY_SOURCE');
  if (!hasCounterpoint) reasons.push('MISSING_COUNTERPOINT');
  if (independentDomains < requiredDomains) reasons.push('INSUFFICIENT_DOMAIN_DIVERSITY');
  if (claimCoverage < MINIMUM_CLAIM_COVERAGE) reasons.push('INSUFFICIENT_CLAIM_COVERAGE');
  if (recentTopic && !input.recentRefreshPerformed) reasons.push('RECENT_TOPIC_REQUIRES_REFRESH');
  return {
    sufficient: reasons.length === 0,
    reasons,
    independentDomains,
    requiredDomains,
    claimCoverage,
    hasPrimarySource,
    hasCounterpoint,
    recentTopic,
  };
}

function hasBriefCounterpoint(
  brief: EditorialBriefContent,
  evidence: EditorialVerificationEvidence[],
): boolean {
  const domainsByEvidence = new Map(evidence.map((item) => [item.evidenceKey, normalizeDomain(item.domain)]));
  return brief.contradictions.some((contradiction) => {
    const sideDomains = contradiction.sides.map((side) =>
      new Set(side.evidenceKeys.map((key) => domainsByEvidence.get(key)).filter(Boolean)));
    return sideDomains.length >= 2
      && sideDomains.every((domains) => domains.size > 0)
      && new Set(sideDomains.flatMap((domains) => [...domains])).size >= 2;
  });
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '');
}
