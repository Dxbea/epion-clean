import type { EditorialRiskLevel } from '@prisma/client';
import { titleSimilarity } from './clustering.js';
import type {
  EditorialCluster,
  EditorialClusteringConfig,
  EditorialScore,
} from './types.js';

const SCORE_WEIGHTS = {
  freshness: 0.25,
  sourceDiversity: 0.2,
  independentDomains: 0.2,
  coverage: 0.2,
  relevance: 0.15,
  riskPenalty: 0.12,
};

const HIGH_SENSITIVITY_TERMS = [
  'attentat', 'terrorisme', 'guerre', 'otage', 'mort', 'meurtre', 'suicide',
  'terror', 'war', 'hostage', 'murder', 'suicide', 'nuclear',
];
const MEDIUM_SENSITIVITY_TERMS = [
  'élection', 'election', 'président', 'president', 'gouvernement', 'government',
  'vaccin', 'vaccine', 'santé', 'health', 'justice', 'procès', 'trial', 'manifestation',
];

export function scoreEditorialCluster(
  cluster: EditorialCluster,
  windowEnd: Date,
  config: EditorialClusteringConfig,
): EditorialScore {
  if (Number.isNaN(windowEnd.getTime())) throw new Error('windowEnd must be a valid date');
  const evidence = cluster.members.filter((member) => member.role !== 'QUASI_DUPLICATE');
  const quasiDuplicates = cluster.members.length - evidence.length;
  const domains = new Set(evidence.map((member) => member.document.domain.toLowerCase()));
  const sources = new Set(evidence.map((member) =>
    member.document.sourceId ?? `domain:${member.document.domain.toLowerCase()}`));

  const ageHours = Math.max(0, windowEnd.getTime() - cluster.latestEventAt.getTime()) /
    (60 * 60 * 1_000);
  const freshnessScore = clampScore(100 * Math.exp(-ageHours / 36));
  const sourceDiversityScore = steppedDiversity(sources.size);
  const independentDomainScore = steppedDomains(domains.size);
  const cohesion = evidence.length === 0
    ? 0
    : evidence.reduce((sum, member) => sum + member.similarityToCentroid, 0) / evidence.length;
  const documentCoverage = Math.min(100, (evidence.length / 6) * 100);
  const coverageScore = clampScore(documentCoverage * 0.7 + cohesion * 100 * 0.3);
  const titleCoherence = averageTitleCoherence(cluster, evidence);
  const relevanceScore = clampScore(cohesion * 75 + titleCoherence * 25);
  const { riskScore, riskLevel } = assessSensitivity(
    cluster.members.map((member) => member.document.title).join(' '),
  );

  const editorialScore = clampScore(
    freshnessScore * SCORE_WEIGHTS.freshness +
    sourceDiversityScore * SCORE_WEIGHTS.sourceDiversity +
    independentDomainScore * SCORE_WEIGHTS.independentDomains +
    coverageScore * SCORE_WEIGHTS.coverage +
    relevanceScore * SCORE_WEIGHTS.relevance -
    riskScore * SCORE_WEIGHTS.riskPenalty,
  );

  const reasons: string[] = [];
  if (evidence.length < config.minProposalDocuments) reasons.push('insufficient_evidence_documents');
  if (domains.size < config.minProposalDomains) reasons.push('insufficient_independent_domains');
  if (editorialScore < config.proposalScoreThreshold) reasons.push('editorial_score_below_threshold');
  if (riskLevel === 'HIGH' && (domains.size < 3 || coverageScore < 50)) {
    reasons.push('high_sensitivity_requires_stronger_corroboration');
  }
  const proposalEligible = reasons.length === 0;

  return {
    status: proposalEligible ? 'SHADOW_PROPOSED' : 'SHADOW_SUPPRESSED',
    editorialScore: round(editorialScore),
    freshnessScore: round(freshnessScore),
    sourceDiversityScore: round(sourceDiversityScore),
    independentDomainScore: round(independentDomainScore),
    coverageScore: round(coverageScore),
    relevanceScore: round(relevanceScore),
    riskScore: round(riskScore),
    riskLevel,
    independentDomains: domains.size,
    independentSources: sources.size,
    evidenceDocuments: evidence.length,
    quasiDuplicates,
    rationale: {
      proposalEligible,
      reasons,
      weights: SCORE_WEIGHTS,
      signals: {
        independentDomains: domains.size,
        independentSources: sources.size,
        evidenceDocuments: evidence.length,
        quasiDuplicates,
      },
    },
  };
}

function averageTitleCoherence(
  cluster: EditorialCluster,
  evidence: EditorialCluster['members'],
): number {
  if (evidence.length <= 1) return evidence.length;
  const representative = evidence.find((member) => member.role === 'REPRESENTATIVE') ?? evidence[0];
  const similarities = evidence
    .filter((member) => member.document.id !== representative.document.id)
    .map((member) => titleSimilarity(representative.document.title, member.document.title));
  return similarities.length === 0
    ? 1
    : similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
}

function assessSensitivity(label: string): {
  riskScore: number;
  riskLevel: EditorialRiskLevel;
} {
  const tokens = new Set(label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean));
  const highMatches = HIGH_SENSITIVITY_TERMS.filter((term) =>
    tokens.has(normalizeTerm(term))).length;
  const mediumMatches = MEDIUM_SENSITIVITY_TERMS.filter((term) =>
    tokens.has(normalizeTerm(term))).length;
  const riskScore = Math.min(100, highMatches * 55 + mediumMatches * 25);
  const riskLevel: EditorialRiskLevel = riskScore >= 55
    ? 'HIGH'
    : riskScore >= 25
      ? 'MEDIUM'
      : 'LOW';
  return { riskScore, riskLevel };
}

function normalizeTerm(term: string): string {
  return term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function steppedDiversity(count: number): number {
  if (count <= 1) return 0;
  if (count === 2) return 40;
  if (count === 3) return 70;
  if (count === 4) return 90;
  return 100;
}

function steppedDomains(count: number): number {
  if (count <= 1) return 0;
  if (count === 2) return 45;
  if (count === 3) return 75;
  if (count === 4) return 92;
  return 100;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
