import { describe, expect, it } from 'vitest';
import { clusterEditorialDocuments } from '../src/lib/editorial-shadow/clustering.js';
import { scoreEditorialCluster } from '../src/lib/editorial-shadow/scoring.js';
import {
  DEFAULT_EDITORIAL_CLUSTERING_CONFIG,
  type EditorialDocumentVector,
} from '../src/lib/editorial-shadow/types.js';

const windowEnd = new Date('2026-07-18T13:00:00Z');

function document(
  id: string,
  title: string,
  embedding: number[],
  overrides: Partial<EditorialDocumentVector> = {},
): EditorialDocumentVector {
  return {
    id,
    title,
    embedding,
    domain: `${id}.example`,
    language: 'fr',
    sourceId: `source-${id}`,
    categoryId: 'actualité',
    eventAt: new Date('2026-07-18T12:00:00Z'),
    ...overrides,
  };
}

function oneCluster(documents: EditorialDocumentVector[]) {
  const clusters = clusterEditorialDocuments(documents, DEFAULT_EDITORIAL_CLUSTERING_CONFIG);
  expect(clusters).toHaveLength(1);
  return clusters[0];
}

describe('internal editorial score', () => {
  it('proposes a fresh corroborated topic from independent sources', () => {
    const cluster = oneCluster([
      document('a', 'Tempête : les transports sont interrompus', [1, 0, 0]),
      document('b', 'Les transports perturbés après une forte tempête', [0.92, 0.28, 0]),
      document('c', 'Bilan des perturbations causées par la tempête', [0.9, 0.31, 0]),
    ]);
    const score = scoreEditorialCluster(cluster, windowEnd, {
      ...DEFAULT_EDITORIAL_CLUSTERING_CONFIG,
      proposalScoreThreshold: 50,
    });

    expect(score.status).toBe('SHADOW_PROPOSED');
    expect(score.independentDomains).toBe(3);
    expect(score.independentSources).toBe(3);
    expect(score.freshnessScore).toBeGreaterThan(90);
    expect(score.rationale.proposalEligible).toBe(true);
  });

  it('suppresses a single-source topic even when it is fresh and relevant', () => {
    const cluster = oneCluster([
      document('a', 'Annonce isolée non corroborée', [1, 0]),
    ]);
    const score = scoreEditorialCluster(cluster, windowEnd, DEFAULT_EDITORIAL_CLUSTERING_CONFIG);

    expect(score.status).toBe('SHADOW_SUPPRESSED');
    expect(score.rationale.reasons).toContain('insufficient_evidence_documents');
    expect(score.rationale.reasons).toContain('insufficient_independent_domains');
  });

  it('excludes semantic near-duplicates from coverage and domain diversity', () => {
    const cluster = oneCluster([
      document('a', 'Même dépêche reprise mot pour mot', [1, 0]),
      document('b', 'Même dépêche reprise mot pour mot', [0.999, 0.005]),
    ]);
    const score = scoreEditorialCluster(cluster, windowEnd, DEFAULT_EDITORIAL_CLUSTERING_CONFIG);

    expect(score.quasiDuplicates).toBe(1);
    expect(score.evidenceDocuments).toBe(1);
    expect(score.status).toBe('SHADOW_SUPPRESSED');
  });

  it('raises the basic sensitivity level for high-risk subjects', () => {
    const cluster = oneCluster([
      document('a', 'Guerre : menace nucléaire et otages', [1, 0]),
      document('b', 'Les otages au cœur du conflit', [0.91, 0.3]),
    ]);
    const score = scoreEditorialCluster(cluster, windowEnd, DEFAULT_EDITORIAL_CLUSTERING_CONFIG);
    expect(score.riskLevel).toBe('HIGH');
    expect(score.riskScore).toBeGreaterThanOrEqual(55);
    expect(score.rationale.reasons).toContain('high_sensitivity_requires_stronger_corroboration');
  });
});
