import { describe, expect, it } from 'vitest';
import { selectEditorialEvidence, type EditorialEvidenceRow } from '../src/lib/editorial-brief/evidence-selection.js';
import { resolveEditorialBriefConfig } from '../src/lib/editorial-brief/dossier-service.js';

function row(document: string, domain: string, similarity: number, topicRole: EditorialEvidenceRow['topicRole'] = 'EVIDENCE', chunk = 0): EditorialEvidenceRow {
  return {
    topicRole,
    documentId: document,
    documentTitle: `Title ${document}`,
    canonicalUrl: `https://${domain}/${document}`,
    domain,
    publishedAt: new Date('2026-07-18T10:00:00Z'),
    chunkId: `${document}-chunk-${chunk}`,
    chunkPosition: chunk,
    content: `Evidence from ${domain} for ${document} chunk ${chunk}`,
    contentHash: `${document}-hash-${chunk}`,
    similarity,
  };
}

describe('editorial evidence selection', () => {
  it('reports no_chunks when the controlled candidate has no usable chunks', () => {
    const result = selectEditorialEvidence([], resolveEditorialBriefConfig(), 1);
    expect(result).toMatchObject({ evidence: [], domains: [], evidenceHash: null, blockedReason: 'No eligible evidence chunks' });
  });

  it('selects independent domains first and separates primary from context evidence', () => {
    const config = resolveEditorialBriefConfig({ maximumDocuments: 4, maximumEvidenceChunks: 6 });
    const result = selectEditorialEvidence([
      row('a', 'one.example', 0.94, 'REPRESENTATIVE'),
      row('a2', 'one.example', 0.93),
      row('b', 'two.example', 0.90),
      row('c', 'three.example', 0.80),
      row('a', 'one.example', 0.79, 'REPRESENTATIVE', 1),
    ], config, 2);

    expect(result.blockedReason).toBeNull();
    expect(result.domains).toEqual(['one.example', 'three.example', 'two.example']);
    expect(result.evidence.filter((item) => item.role === 'PRIMARY').map((item) => item.documentId))
      .toEqual(['a', 'a', 'b']);
    expect(result.evidence.some((item) => item.role === 'CONTEXT' && item.documentId === 'c')).toBe(true);
    expect(result.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('blocks before generation when independent source diversity is insufficient', () => {
    const result = selectEditorialEvidence([
      row('a', 'one.example', 0.95, 'REPRESENTATIVE'),
      row('b', 'one.example', 0.90),
    ], resolveEditorialBriefConfig(), 2);

    expect(result.evidence).toEqual([]);
    expect(result.evidenceHash).toBeNull();
    expect(result.blockedReason).toContain('1/2 domains');
  });

  it('is deterministic and excludes chunks below the semantic threshold', () => {
    const config = resolveEditorialBriefConfig({ minimumChunkSimilarity: 0.7 });
    const rows = [row('a', 'one.example', 0.9, 'REPRESENTATIVE'), row('b', 'two.example', 0.8), row('c', 'three.example', 0.6)];
    const first = selectEditorialEvidence(rows, config, 2);
    const second = selectEditorialEvidence([...rows].reverse(), config, 2);
    expect(second.evidenceHash).toBe(first.evidenceHash);
    expect(first.evidence.map((item) => item.documentId)).not.toContain('c');
  });
});
