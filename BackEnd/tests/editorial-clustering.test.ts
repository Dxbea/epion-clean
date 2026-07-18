import { describe, expect, it } from 'vitest';
import {
  clusterEditorialDocuments,
  cosineSimilarity,
  titleSimilarity,
} from '../src/lib/editorial-shadow/clustering.js';
import {
  DEFAULT_EDITORIAL_CLUSTERING_CONFIG,
  type EditorialDocumentVector,
} from '../src/lib/editorial-shadow/types.js';

const baseDate = new Date('2026-07-18T12:00:00Z');

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
    categoryId: 'news',
    eventAt: baseDate,
    ...overrides,
  };
}

describe('deterministic event clustering', () => {
  it('groups one event, separates an unrelated topic and flags one semantic near-duplicate', () => {
    const documents = [
      document('a', 'Séisme majeur frappe Marseille', [1, 0, 0]),
      document('b', 'Fort tremblement de terre ressenti à Marseille', [0.94, 0.25, 0]),
      document('c', 'Séisme majeur frappe Marseille', [0.999, 0.01, 0]),
      document('d', 'La banque centrale relève ses taux', [0, 1, 0]),
    ];

    const clusters = clusterEditorialDocuments(documents, DEFAULT_EDITORIAL_CLUSTERING_CONFIG);

    expect(clusters).toHaveLength(2);
    const event = clusters.find((cluster) => cluster.members.length === 3);
    expect(event).toBeDefined();
    expect(event?.members.filter((member) => member.role === 'QUASI_DUPLICATE'))
      .toHaveLength(1);
    expect(event?.members.filter((member) => member.role === 'REPRESENTATIVE'))
      .toHaveLength(1);
    expect(event?.members.every((member) => member.similarityToCentroid >= 0.9)).toBe(true);
  });

  it('is stable regardless of discovery order', () => {
    const documents = [
      document('a', 'Incendie maîtrisé dans le port', [1, 0]),
      document('b', 'Le feu du port est désormais maîtrisé', [0.93, 0.24]),
      document('c', 'Résultats trimestriels du groupe', [0, 1]),
    ];
    const forward = clusterEditorialDocuments(documents, DEFAULT_EDITORIAL_CLUSTERING_CONFIG);
    const reverse = clusterEditorialDocuments([...documents].reverse(), DEFAULT_EDITORIAL_CLUSTERING_CONFIG);

    expect(forward.map((cluster) => cluster.clusterKey))
      .toEqual(reverse.map((cluster) => cluster.clusterKey));
    expect(forward.map((cluster) => cluster.representativeDocumentId))
      .toEqual(reverse.map((cluster) => cluster.representativeDocumentId));
  });

  it('does not merge documents outside the event window or in different known languages', () => {
    const old = new Date(baseDate.getTime() - 5 * 24 * 60 * 60 * 1_000);
    const clusters = clusterEditorialDocuments([
      document('a', 'Même sujet récent', [1, 0]),
      document('b', 'Même sujet ancien', [1, 0], { eventAt: old }),
      document('c', 'Same topic in English', [1, 0], { language: 'en' }),
    ], DEFAULT_EDITORIAL_CLUSTERING_CONFIG);
    expect(clusters).toHaveLength(3);
  });

  it('exposes bounded semantic and lexical similarity helpers', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(titleSimilarity(
      'Élection présidentielle en France',
      'France : résultats de l’élection présidentielle',
    )).toBeGreaterThan(0.5);
  });
});
