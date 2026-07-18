import { describe, expect, it } from 'vitest';
import { validateEditorialClaimReviews, validateEditorialDraftArtifact } from '../src/lib/editorial-draft/draft-validation.js';
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
});
