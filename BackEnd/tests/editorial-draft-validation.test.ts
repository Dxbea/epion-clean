import { describe, expect, it } from 'vitest';
import { describeEditorialDraftValidationError, normalizeEditorialDraftArtifact, validateEditorialClaimReviews, validateEditorialDraftArtifact, validateEditorialDraftClaimDomainCoverage } from '../src/lib/editorial-draft/draft-validation.js';
import { renderEditorialDraftHtml } from '../src/lib/editorial-draft/draft-service.js';
import { draftEvidence, validArtifact } from './fixtures/editorial/draft.js';

describe('controlled editorial draft validation', () => {
  it('accepts a fully claim-addressable artifact and renders only declared claims', () => {
    const artifact = validateEditorialDraftArtifact(validArtifact, draftEvidence, 10);
    const html = renderEditorialDraftHtml(artifact);
    expect(html).toContain('data-editorial-claim="claim_1"');
    expect(html).toContain('Central fact.');
    expect(html).not.toContain('<script>');
  });

  it('rejects unknown evidence and undeclared body claims', () => {
    expect(() => validateEditorialDraftArtifact({
      ...validArtifact,
      claims: [{ ...validArtifact.claims[0], evidenceKeys: ['ev_unknown'] }, validArtifact.claims[1]],
    }, draftEvidence, 10)).toThrow('unknown evidence');
    expect(() => validateEditorialDraftArtifact({
      ...validArtifact,
      sections: [{ heading: 'One', claimKeys: ['unknown_claim'] }, validArtifact.sections[1]],
    }, draftEvidence, 10)).toThrow('unknown claim');
  });

  it('normalizes only case-equivalent importance values and rejects other values', () => {
    const normalized = normalizeEditorialDraftArtifact({
      ...validArtifact,
      claims: validArtifact.claims.map((claim) => ({ ...claim, importance: claim.importance.toLowerCase() })),
    });
    expect((normalized as typeof validArtifact).claims.map((claim) => claim.importance)).toEqual(['CORE', 'SUPPORTING']);
    expect(() => validateEditorialDraftArtifact({
      ...validArtifact,
      claims: [{ ...validArtifact.claims[0], importance: 'MAIN' }, validArtifact.claims[1]],
    }, draftEvidence, 10)).toThrow('Invalid option');
    expect(describeEditorialDraftValidationError(new Error('diagnostic'))).toBe('diagnostic');
  });

  it('requires exactly one critic verdict per claim and forbids evidence expansion', () => {
    const artifact = validateEditorialDraftArtifact(validArtifact, draftEvidence, 10);
    expect(() => validateEditorialClaimReviews([
      { claimKey: 'claim_1', verdict: 'SUPPORTED', explanation: 'Supported.', evidenceKeys: ['ev_unknown'] },
      { claimKey: 'claim_2', verdict: 'SUPPORTED', explanation: 'Supported.', evidenceKeys: ['ev_two'] },
    ], artifact)).toThrow('expanded evidence');
    expect(() => validateEditorialClaimReviews([
      { claimKey: 'claim_1', verdict: 'SUPPORTED', explanation: 'Supported.', evidenceKeys: ['ev_one'] },
    ], artifact)).toThrow('every claim exactly once');
  });

  it('requires citations to cover two independent domains when both are available', () => {
    const singleDomainArtifact = {
      ...validArtifact,
      claims: validArtifact.claims.map((claim) => ({ ...claim, evidenceKeys: ['ev_two'] })),
    };
    const artifact = validateEditorialDraftArtifact(singleDomainArtifact, draftEvidence, 10);
    expect(() => validateEditorialDraftClaimDomainCoverage(artifact, draftEvidence)).toThrow('independent evidence domains');
    expect(() => validateEditorialDraftClaimDomainCoverage(validArtifact, draftEvidence)).not.toThrow();
  });
});
