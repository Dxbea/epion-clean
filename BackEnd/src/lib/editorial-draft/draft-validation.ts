import { z } from 'zod';
import type { EditorialEvidenceSnapshot } from '../editorial-brief/types.js';
import type { EditorialClaimReview, EditorialDraftArtifact } from './types.js';

const cleanText = (max: number) => z.string().trim().min(1).max(max);
const key = cleanText(80);

const artifactSchema = z.object({
  title: cleanText(200),
  titleClaimKeys: z.array(key).min(1).max(5),
  summary: cleanText(1_000),
  summaryClaimKeys: z.array(key).min(1).max(12),
  sections: z.array(z.object({
    heading: cleanText(200),
    claimKeys: z.array(key).min(1).max(12),
  }).strict()).min(2).max(12),
  claims: z.array(z.object({
    claimKey: key,
    text: cleanText(2_000),
    importance: z.enum(['CORE', 'SUPPORTING', 'CONTEXT']),
    evidenceKeys: z.array(key).min(1).max(12),
  }).strict()).min(2).max(50),
}).strict();

const reviewsSchema = z.array(z.object({
  claimKey: key,
  verdict: z.enum(['SUPPORTED', 'PARTIALLY_SUPPORTED', 'UNSUPPORTED', 'CONTRADICTED']),
  explanation: cleanText(1_500),
  evidenceKeys: z.array(key).max(12),
}).strict()).min(1).max(50);

export function validateEditorialDraftArtifact(
  input: unknown,
  evidence: EditorialEvidenceSnapshot[],
  maximumClaims: number,
): EditorialDraftArtifact {
  const artifact = artifactSchema.parse(input) as EditorialDraftArtifact;
  if (artifact.claims.length > maximumClaims) throw new Error(`Editorial draft exceeds maximumClaims (${maximumClaims})`);
  assertUnique(artifact.claims.map((claim) => claim.claimKey), 'claim keys');
  const claimKeys = new Set(artifact.claims.map((claim) => claim.claimKey));
  const evidenceKeys = new Set(evidence.map((item) => item.evidenceKey));
  for (const referenced of [...artifact.titleClaimKeys, ...artifact.summaryClaimKeys, ...artifact.sections.flatMap((section) => section.claimKeys)]) {
    if (!claimKeys.has(referenced)) throw new Error(`Editorial draft references unknown claim: ${referenced}`);
  }
  const claimsByKey = new Map(artifact.claims.map((claim) => [claim.claimKey, claim]));
  for (const prominentKey of [...artifact.titleClaimKeys, ...artifact.summaryClaimKeys]) {
    if (claimsByKey.get(prominentKey)?.importance !== 'CORE') {
      throw new Error(`Editorial title and summary may reference only CORE claims: ${prominentKey}`);
    }
  }
  const usedClaims = new Set([...artifact.titleClaimKeys, ...artifact.summaryClaimKeys, ...artifact.sections.flatMap((section) => section.claimKeys)]);
  for (const claim of artifact.claims) {
    if (!usedClaims.has(claim.claimKey)) throw new Error(`Editorial draft contains an unused claim: ${claim.claimKey}`);
    for (const evidenceKey of claim.evidenceKeys) {
      if (!evidenceKeys.has(evidenceKey)) throw new Error(`Editorial claim references unknown evidence: ${evidenceKey}`);
    }
  }
  return artifact;
}

export function validateEditorialClaimReviews(
  input: unknown,
  artifact: EditorialDraftArtifact,
): EditorialClaimReview[] {
  const reviews = reviewsSchema.parse(input) as EditorialClaimReview[];
  assertUnique(reviews.map((review) => review.claimKey), 'critic claim keys');
  const claimsByKey = new Map(artifact.claims.map((claim) => [claim.claimKey, claim]));
  if (reviews.length !== artifact.claims.length) throw new Error('Editorial critic must review every claim exactly once');
  for (const review of reviews) {
    const claim = claimsByKey.get(review.claimKey);
    if (!claim) throw new Error(`Editorial critic references unknown claim: ${review.claimKey}`);
    const allowed = new Set(claim.evidenceKeys);
    for (const evidenceKey of review.evidenceKeys) {
      if (!allowed.has(evidenceKey)) throw new Error(`Editorial critic expanded evidence for claim ${review.claimKey}`);
    }
    if ((review.verdict === 'SUPPORTED' || review.verdict === 'PARTIALLY_SUPPORTED') && !review.evidenceKeys.length) {
      throw new Error(`Supported editorial claim requires critic evidence: ${review.claimKey}`);
    }
  }
  return reviews;
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Editorial draft contains duplicate ${label}`);
}
