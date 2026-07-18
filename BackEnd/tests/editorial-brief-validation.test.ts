import { describe, expect, it } from 'vitest';
import { buildAuditableBriefContent, validateEditorialBriefDraft } from '../src/lib/editorial-brief/brief-validation.js';
import type { EditorialEvidenceSnapshot } from '../src/lib/editorial-brief/types.js';

const evidence: EditorialEvidenceSnapshot[] = [
  { evidenceKey: 'ev_one', documentId: 'doc-1', chunkId: 'chunk-1', role: 'PRIMARY', position: 0, similarity: 0.9, documentTitle: 'Primary', canonicalUrl: 'https://one.example/a', domain: 'one.example', publishedAt: null, chunkPosition: 0, contentSnapshot: 'A', contentHash: 'hash-a' },
  { evidenceKey: 'ev_two', documentId: 'doc-2', chunkId: 'chunk-2', role: 'CONTEXT', position: 1, similarity: 0.8, documentTitle: 'Context', canonicalUrl: 'https://two.example/b', domain: 'two.example', publishedAt: null, chunkPosition: 0, contentSnapshot: 'B', contentHash: 'hash-b' },
];

const draft = {
  summary: 'A factual summary.',
  centralFacts: [{ id: 'fact_1', text: 'A supported fact.', confidence: 'HIGH', evidenceKeys: ['ev_one'] }],
  timeline: [{ date: '2026-07-18', event: 'A sourced event.', evidenceKeys: ['ev_one'] }],
  contradictions: [{ id: 'conflict_1', question: 'What differs?', sides: [{ position: 'Position A', evidenceKeys: ['ev_one'] }, { position: 'Position B', evidenceKeys: ['ev_two'] }], assessment: 'The evidence disagrees.' }],
  uncertainties: [{ question: 'Still unknown?', evidenceKeys: [] }],
  missingAngles: [{ angle: 'Official response', reason: 'No official source in the dossier.' }],
};

describe('editorial factual brief validation', () => {
  it('accepts sourced facts and genuine two-sided contradiction structures', () => {
    const result = validateEditorialBriefDraft(draft, new Set(['ev_one', 'ev_two']), evidence);
    expect(result.contradictions[0].sides).toHaveLength(2);
  });

  it('rejects hallucinated evidence references', () => {
    expect(() => validateEditorialBriefDraft({
      ...draft,
      centralFacts: [{ ...draft.centralFacts[0], evidenceKeys: ['ev_unknown'] }],
    }, new Set(['ev_one', 'ev_two']))).toThrow('unknown evidence key');
  });

  it('rejects contradictions supported by only one independent domain', () => {
    const sameDomainEvidence = evidence.map((item) => ({ ...item, domain: 'one.example' }));
    expect(() => validateEditorialBriefDraft(draft, new Set(['ev_one', 'ev_two']), sameDomainEvidence))
      .toThrow('two independent domains');
  });

  it('derives auditable primary and context source lists from frozen evidence', () => {
    const validated = validateEditorialBriefDraft(draft, new Set(['ev_one', 'ev_two']));
    const content = buildAuditableBriefContent({ draft: validated, topicLabel: 'Topic', dossierId: 'dossier-1', candidateId: 'candidate-1', evidenceHash: 'hash', promptVersion: 'prompt-v1', generatorModel: 'test-model', evidence });
    expect(content.primarySources[0]).toMatchObject({ documentId: 'doc-1', evidenceKeys: ['ev_one'] });
    expect(content.contextSources[0]).toMatchObject({ documentId: 'doc-2', evidenceKeys: ['ev_two'] });
    expect(content.audit).toMatchObject({ dossierId: 'dossier-1', candidateId: 'candidate-1', evidenceHash: 'hash' });
  });
});
