import { describe, expect, it } from 'vitest';
import { calculateEditorialQualityGate } from '../src/lib/editorial-draft/quality-gate.js';
import { resolveEditorialDraftConfig } from '../src/lib/editorial-draft/draft-service.js';
import { draftEvidence, validArtifact } from './fixtures/editorial/draft.js';

describe('editorial quality and publishability gate', () => {
  it('passes independently from FactScore when every claim and diversity threshold passes', () => {
    const gate = calculateEditorialQualityGate({
      artifact: validArtifact as any,
      reviews: [
        { claimKey: 'claim_1', verdict: 'SUPPORTED', explanation: 'Direct support.', evidenceKeys: ['ev_one', 'ev_two'] },
        { claimKey: 'claim_2', verdict: 'SUPPORTED', explanation: 'Direct support.', evidenceKeys: ['ev_two'] },
      ],
      evidence: draftEvidence,
      riskLevel: 'MEDIUM',
      config: resolveEditorialDraftConfig(),
    });
    expect(gate).toMatchObject({ automatedDecision: 'PASSED', qualityScore: 100, publishabilityScore: 100, citationCoverage: 1, independentDomains: 2 });
  });

  it('fails hard for an unsupported core claim or contradicted claim', () => {
    const gate = calculateEditorialQualityGate({
      artifact: validArtifact as any,
      reviews: [
        { claimKey: 'claim_1', verdict: 'UNSUPPORTED', explanation: 'Not established.', evidenceKeys: [] },
        { claimKey: 'claim_2', verdict: 'CONTRADICTED', explanation: 'Conflict.', evidenceKeys: ['ev_two'] },
      ],
      evidence: draftEvidence,
      riskLevel: 'MEDIUM',
      config: resolveEditorialDraftConfig(),
    });
    expect(gate.automatedDecision).toBe('FAILED');
    expect(gate.reasons).toContain('CORE_CLAIM_SUPPORT_BELOW_THRESHOLD');
    expect(gate.reasons).toContain('CONTRADICTED_CLAIMS_PRESENT');
    expect(gate.publishabilityScore).toBeLessThan(gate.qualityScore);
  });

  it('requires three independent domains for high-risk candidates by default', () => {
    const gate = calculateEditorialQualityGate({
      artifact: validArtifact as any,
      reviews: validArtifact.claims.map((claim) => ({ claimKey: claim.claimKey, verdict: 'SUPPORTED' as const, explanation: 'Supported.', evidenceKeys: claim.evidenceKeys })),
      evidence: draftEvidence,
      riskLevel: 'HIGH',
      config: resolveEditorialDraftConfig(),
    });
    expect(gate.automatedDecision).toBe('FAILED');
    expect(gate.reasons).toContain('INSUFFICIENT_INDEPENDENT_DOMAINS');
  });
});
