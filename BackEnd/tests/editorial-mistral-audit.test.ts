import { describe, expect, it } from 'vitest';
import { validateMistralAudit } from '../src/lib/editorial-verification/mistral-auditor.js';

const claims = [
  { claimKey: 'core', text: 'Central fact', importance: 'CORE' as const, primaryVerdict: 'SUPPORTED' as const, evidenceKeys: ['ev_1'] },
  { claimKey: 'context', text: 'Context fact', importance: 'CONTEXT' as const, primaryVerdict: 'PARTIALLY_SUPPORTED' as const, evidenceKeys: ['ev_2'] },
];
const evidence = [
  { evidenceKey: 'ev_1', documentId: 'd1', sourceId: 's1', url: 'https://one.example/a', title: 'One', domain: 'one.example', content: 'Central fact', publishedAt: null, lane: 'PRIMARY' as const, origin: 'CORPUS' as const },
  { evidenceKey: 'ev_2', documentId: 'd2', sourceId: 's2', url: 'https://two.example/b', title: 'Two', domain: 'two.example', content: 'Context fact', publishedAt: null, lane: 'CONTEXT' as const, origin: 'CORPUS' as const },
];

function validPayload() {
  return {
    claims: [
      { claimKey: 'core', verdict: 'SUPPORTED', evidenceKeys: ['ev_1'], citationValid: true, sourceValid: true, contradiction: false, explanation: 'Confirmed' },
      { claimKey: 'context', verdict: 'PARTIALLY_SUPPORTED', evidenceKeys: ['ev_2'], citationValid: true, sourceValid: true, contradiction: false, explanation: 'Partial' },
    ],
    contradictions: [],
  };
}

describe('independent fail-closed Mistral editorial audit', () => {
  it('passes only a complete claim and citation audit', () => {
    expect(validateMistralAudit(validPayload(), claims, evidence)).toMatchObject({
      outcome: 'PASSED', available: true, validJson: true, reasons: [],
    });
  });

  it('requires human review on a central disagreement', () => {
    const payload = validPayload();
    payload.claims[0].verdict = 'PARTIALLY_SUPPORTED';
    const result = validateMistralAudit(payload, claims, evidence);
    expect(result.outcome).toBe('HUMAN_REVIEW_REQUIRED');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'MISTRAL_CORE_CLAIM_DISAGREEMENT',
      'MISTRAL_CORE_CLAIM_NOT_SUPPORTED',
    ]));
  });

  it('fails closed on invalid sources or malformed JSON', () => {
    const invalidSource = validPayload();
    invalidSource.claims[0].evidenceKeys = ['invented'];
    expect(validateMistralAudit(invalidSource, claims, evidence)).toMatchObject({
      outcome: 'HUMAN_REVIEW_REQUIRED',
      invalidEvidenceKeys: ['invented'],
    });
    expect(validateMistralAudit({ claims: 'invalid' }, claims, evidence)).toMatchObject({
      outcome: 'HUMAN_REVIEW_REQUIRED', validJson: false, reasons: ['MISTRAL_INVALID_JSON'],
    });
  });
});
