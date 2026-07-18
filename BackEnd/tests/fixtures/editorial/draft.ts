import type { EditorialEvidenceSnapshot } from '../../../src/lib/editorial-brief/types.js';

export const draftEvidence: EditorialEvidenceSnapshot[] = [
  { evidenceKey: 'ev_one', documentId: 'doc-1', chunkId: 'chunk-1', role: 'PRIMARY', position: 0, similarity: 0.9, documentTitle: 'One', canonicalUrl: 'https://one.example/a', domain: 'one.example', publishedAt: null, chunkPosition: 0, contentSnapshot: 'Evidence one', contentHash: 'hash-1' },
  { evidenceKey: 'ev_two', documentId: 'doc-2', chunkId: 'chunk-2', role: 'PRIMARY', position: 1, similarity: 0.8, documentTitle: 'Two', canonicalUrl: 'https://two.example/b', domain: 'two.example', publishedAt: null, chunkPosition: 0, contentSnapshot: 'Evidence two', contentHash: 'hash-2' },
];

export const validArtifact = {
  title: 'Controlled title',
  titleClaimKeys: ['claim_1'],
  summary: 'A sourced summary.',
  summaryClaimKeys: ['claim_1'],
  sections: [
    { heading: 'What happened', claimKeys: ['claim_1'] },
    { heading: 'Context', claimKeys: ['claim_2'] },
  ],
  claims: [
    { claimKey: 'claim_1', text: 'Central fact.', importance: 'CORE', evidenceKeys: ['ev_one', 'ev_two'] },
    { claimKey: 'claim_2', text: 'Context fact.', importance: 'SUPPORTING', evidenceKeys: ['ev_two'] },
  ],
};
