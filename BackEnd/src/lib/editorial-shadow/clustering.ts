import { createHash } from 'node:crypto';
import type { EditorialTopicDocumentRole } from '@prisma/client';
import {
  EDITORIAL_CLUSTERING_ALGORITHM_VERSION,
  type EditorialCluster,
  type EditorialClusterMember,
  type EditorialClusteringConfig,
  type EditorialDocumentVector,
} from './types.js';

interface WorkingCluster {
  documents: EditorialDocumentVector[];
  centroid: number[];
}

const TITLE_STOP_WORDS = new Set([
  'a', 'au', 'aux', 'avec', 'ce', 'ces', 'dans', 'de', 'des', 'du', 'en', 'et',
  'la', 'le', 'les', 'pour', 'sur', 'un', 'une', 'the', 'of', 'to', 'in', 'on',
  'for', 'and', 'with', 'from', 'is', 'are', 'as', 'at', 'by', 'an',
]);

export function clusterEditorialDocuments(
  documents: EditorialDocumentVector[],
  config: EditorialClusteringConfig,
): EditorialCluster[] {
  validateDocuments(documents);
  const ordered = [...documents].sort(compareDocuments);
  const working: WorkingCluster[] = [];

  for (const document of ordered) {
    let bestCluster: WorkingCluster | null = null;
    let bestAffinity = -1;

    for (const cluster of working) {
      if (!languageCompatible(document, cluster.documents[0])) continue;
      if (!withinEventWindow(document, cluster.documents, config.maxEventGapHours)) continue;
      const affinity = topicAffinity(document, cluster);
      if (affinity >= config.topicSimilarityThreshold && affinity > bestAffinity) {
        bestCluster = cluster;
        bestAffinity = affinity;
      }
    }

    if (!bestCluster) {
      working.push({ documents: [document], centroid: [...document.embedding] });
      continue;
    }

    const previousCount = bestCluster.documents.length;
    bestCluster.centroid = bestCluster.centroid.map((value, index) =>
      (value * previousCount + document.embedding[index]) / (previousCount + 1));
    bestCluster.documents.push(document);
  }

  return working
    .map((cluster) => materializeCluster(cluster, config))
    .sort((left, right) =>
      right.latestEventAt.getTime() - left.latestEventAt.getTime() ||
      left.clusterKey.localeCompare(right.clusterKey));
}

/**
 * Rebuilds one persisted topic after controlled source enrichment. The topic
 * membership is authoritative here; enrichment has already decided that the
 * additional documents belong to this topic, so we only reclassify members
 * and recompute the values consumed by editorial scoring.
 */
export function extendEditorialCluster(
  cluster: EditorialCluster,
  additionalDocuments: EditorialDocumentVector[],
  config: EditorialClusteringConfig,
): EditorialCluster {
  const documents = [...cluster.members.map((member) => member.document)];
  const knownIds = new Set(documents.map((document) => document.id));
  for (const document of additionalDocuments) {
    if (!knownIds.has(document.id)) {
      documents.push(document);
      knownIds.add(document.id);
    }
  }
  validateDocuments(documents);
  const materialized = materializeCluster({
    documents,
    centroid: averageEmbeddings(documents.map((document) => document.embedding)),
  }, config);
  return {
    ...materialized,
    // Keep the persisted topic identity stable while its score is refreshed.
    clusterKey: cluster.clusterKey,
  };
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return clamp01(dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)));
}

export function titleSimilarity(left: string, right: string): number {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection++;
  }
  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

function materializeCluster(
  cluster: WorkingCluster,
  config: EditorialClusteringConfig,
): EditorialCluster {
  const centroid = averageEmbeddings(cluster.documents.map((document) => document.embedding));
  const representative = [...cluster.documents].sort((left, right) => {
    const similarityDifference = cosineSimilarity(right.embedding, centroid) -
      cosineSimilarity(left.embedding, centroid);
    return similarityDifference || compareDocuments(left, right);
  })[0];
  const members = classifyMembers(cluster.documents, representative, centroid, config);
  const dates = cluster.documents.map((document) => document.eventAt.getTime());

  return {
    clusterKey: buildClusterKey(cluster.documents),
    label: representative.title || 'Sujet sans titre',
    language: mostFrequent(cluster.documents.map((document) => document.language)),
    dominantCategoryId: mostFrequent(cluster.documents.map((document) => document.categoryId)),
    dominantSourceId: mostFrequent(cluster.documents.map((document) => document.sourceId)),
    representativeDocumentId: representative.id,
    firstEventAt: new Date(Math.min(...dates)),
    latestEventAt: new Date(Math.max(...dates)),
    centroid,
    members,
  };
}

function classifyMembers(
  documents: EditorialDocumentVector[],
  representative: EditorialDocumentVector,
  centroid: number[],
  config: EditorialClusteringConfig,
): EditorialClusterMember[] {
  const ordered = [
    representative,
    ...documents.filter((document) => document.id !== representative.id).sort(compareDocuments),
  ];
  const evidence: EditorialDocumentVector[] = [representative];

  return ordered.map((document, index) => {
    let role: EditorialTopicDocumentRole = index === 0 ? 'REPRESENTATIVE' : 'EVIDENCE';
    let quasiDuplicateOfDocumentId: string | null = null;

    if (index > 0) {
      const duplicate = evidence
        .map((candidate) => ({
          candidate,
          semantic: cosineSimilarity(document.embedding, candidate.embedding),
          title: titleSimilarity(document.title, candidate.title),
        }))
        .filter(({ semantic, title }) =>
          (semantic >= 0.985 && title >= 0.35) ||
          (semantic >= config.quasiDuplicateSimilarityThreshold &&
            title >= config.quasiDuplicateTitleThreshold))
        .sort((left, right) =>
          right.semantic - left.semantic || left.candidate.id.localeCompare(right.candidate.id))[0];

      if (duplicate) {
        role = 'QUASI_DUPLICATE';
        quasiDuplicateOfDocumentId = duplicate.candidate.id;
      } else {
        evidence.push(document);
      }
    }

    return {
      document,
      role,
      quasiDuplicateOfDocumentId,
      similarityToCentroid: round(cosineSimilarity(document.embedding, centroid), 6),
    };
  });
}

function topicAffinity(document: EditorialDocumentVector, cluster: WorkingCluster): number {
  const representative = cluster.documents[0];
  const semantic = cosineSimilarity(document.embedding, cluster.centroid);
  const title = titleSimilarity(document.title, representative.title);
  const category = document.categoryId && representative.categoryId === document.categoryId ? 1 : 0;
  const language = document.language === representative.language ? 1 : 0;
  const sameSource = Boolean(
    document.sourceId && representative.sourceId === document.sourceId,
  );
  const sameDomain = document.domain.toLowerCase() === representative.domain.toLowerCase();
  const provenance = sameSource ? 1 : sameDomain ? 0.75 : 0.5;
  const metadata = category * 0.5 + language * 0.2 + provenance * 0.3;
  return semantic * 0.85 + title * 0.1 + metadata * 0.05;
}

function withinEventWindow(
  document: EditorialDocumentVector,
  clusterDocuments: EditorialDocumentVector[],
  maximumHours: number,
): boolean {
  const latest = Math.max(...clusterDocuments.map((item) => item.eventAt.getTime()));
  return Math.abs(latest - document.eventAt.getTime()) <= maximumHours * 60 * 60 * 1_000;
}

function languageCompatible(
  document: EditorialDocumentVector,
  representative: EditorialDocumentVector,
): boolean {
  return !document.language || !representative.language ||
    document.language.toLowerCase() === representative.language.toLowerCase();
}

function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  const average = Array.from({ length: embeddings[0].length }, () => 0);
  for (const embedding of embeddings) {
    for (let index = 0; index < embedding.length; index++) average[index] += embedding[index];
  }
  return average.map((value) => value / embeddings.length);
}

function buildClusterKey(documents: EditorialDocumentVector[]): string {
  const identity = documents.map((document) => document.id).sort().join(':');
  return createHash('sha256')
    .update(`${EDITORIAL_CLUSTERING_ALGORITHM_VERSION}:${identity}`)
    .digest('hex');
}

function titleTokens(title: string): Set<string> {
  return new Set(title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !TITLE_STOP_WORDS.has(token)));
}

function mostFrequent(values: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
}

function compareDocuments(left: EditorialDocumentVector, right: EditorialDocumentVector): number {
  return right.eventAt.getTime() - left.eventAt.getTime() || left.id.localeCompare(right.id);
}

function validateDocuments(documents: EditorialDocumentVector[]): void {
  const expectedDimensions = documents[0]?.embedding.length ?? 0;
  const documentIds = new Set<string>();
  for (const document of documents) {
    if (!document.id || Number.isNaN(document.eventAt.getTime())) {
      throw new Error('Editorial clustering documents require an ID and a valid event date');
    }
    if (documentIds.has(document.id)) {
      throw new Error(`Editorial clustering document IDs must be unique: ${document.id}`);
    }
    documentIds.add(document.id);
    if (expectedDimensions === 0 || document.embedding.length !== expectedDimensions) {
      throw new Error('Editorial clustering embeddings must share a non-zero dimension');
    }
    if (document.embedding.some((value) => !Number.isFinite(value))) {
      throw new Error('Editorial clustering embeddings must contain finite numbers');
    }
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
