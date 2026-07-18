import { describe, expect, it } from 'vitest';
import { calculateEditorialShadowEligibility } from '../src/lib/editorial-verification/shadow-eligibility.js';

const eligible = {
  verificationStatus: 'PASSED' as const,
  articleStatus: 'DRAFT',
  factCheckScore: 91,
  qualityScore: 92,
  publishabilityScore: 90,
  riskLevel: 'LOW' as const,
  categorySlug: 'science',
  topicLabel: 'Une nouvelle mission spatiale européenne',
  independentDomains: 4,
  sourceCount: 5,
  mistralPassed: true,
  contradictionCount: 0,
  gateReasons: [],
};

describe('editorial autopublication shadow eligibility', () => {
  it('reports WOULD_AUTO_PUBLISH without mutating an Article', () => {
    expect(calculateEditorialShadowEligibility(eligible)).toMatchObject({
      decision: 'WOULD_AUTO_PUBLISH',
      reasons: ['ALL_SHADOW_AUTO_GATES_PASSED'],
    });
  });

  it('requires a human for sensitive or insufficiently diverse topics', () => {
    expect(calculateEditorialShadowEligibility({
      ...eligible,
      categorySlug: 'elections',
      topicLabel: 'Election nationale',
      independentDomains: 2,
    })).toMatchObject({
      decision: 'WOULD_REQUIRE_HUMAN',
      reasons: expect.arrayContaining(['SENSITIVE_TOPIC', 'INSUFFICIENT_AUTO_DIVERSITY']),
    });
  });

  it('rejects fundamental evidence failures and weak quality', () => {
    expect(calculateEditorialShadowEligibility({
      ...eligible,
      qualityScore: 60,
      gateReasons: ['MISTRAL_CORE_CLAIM_NOT_SUPPORTED'],
    })).toMatchObject({
      decision: 'WOULD_REJECT',
      reasons: expect.arrayContaining(['FUNDAMENTAL_EVIDENCE_FAILURE', 'QUALITY_REJECT_THRESHOLD']),
    });
  });
});
