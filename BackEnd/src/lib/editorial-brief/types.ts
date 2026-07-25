import type { EditorialEvidenceRole, EditorialRiskLevel } from '@prisma/client';
import type { EvidenceProvenance } from '../article-generation-core/types.js';

export const EDITORIAL_DOSSIER_VERSION = 'source-dossier-v1';
export const EDITORIAL_BRIEF_PROMPT_VERSION = 'factual-brief-v1';
export const EDITORIAL_BRIEF_SCHEMA_VERSION = 1;

export interface EditorialBriefConfig {
  minimumEditorialScore: number;
  minimumDomains: number;
  highRiskMinimumDomains: number;
  maximumCandidates: number;
  maximumDocuments: number;
  maximumChunksPerDocument: number;
  maximumEvidenceChunks: number;
  minimumChunkSimilarity: number;
}

export const DEFAULT_EDITORIAL_BRIEF_CONFIG: EditorialBriefConfig = {
  minimumEditorialScore: 60,
  minimumDomains: 2,
  highRiskMinimumDomains: 3,
  maximumCandidates: 5,
  maximumDocuments: 6,
  maximumChunksPerDocument: 2,
  maximumEvidenceChunks: 12,
  minimumChunkSimilarity: 0.55,
};

export interface SelectedEditorialCandidate {
  candidateId: string;
  rank: number;
  editorialScore: number;
  riskLevel: EditorialRiskLevel;
  requiredDomains: number;
}

export interface EditorialEvidenceSnapshot {
  evidenceKey: string;
  documentId: string;
  chunkId: string;
  role: EditorialEvidenceRole;
  position: number;
  similarity: number;
  documentTitle: string;
  canonicalUrl: string;
  domain: string;
  publishedAt: Date | null;
  chunkPosition: number;
  contentSnapshot: string;
  contentHash: string;
  sourceId?: string | null;
  provenance?: EvidenceProvenance;
}

export interface EditorialBriefFact {
  id: string;
  text: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidenceKeys: string[];
}

export interface EditorialBriefTimelineEntry {
  date: string;
  event: string;
  evidenceKeys: string[];
}

export interface EditorialBriefContradictionSide {
  position: string;
  evidenceKeys: string[];
}

export interface EditorialBriefContradiction {
  id: string;
  question: string;
  sides: EditorialBriefContradictionSide[];
  assessment: string;
}

export interface EditorialBriefDraft {
  summary: string;
  centralFacts: EditorialBriefFact[];
  timeline: EditorialBriefTimelineEntry[];
  contradictions: EditorialBriefContradiction[];
  uncertainties: Array<{
    question: string;
    evidenceKeys: string[];
  }>;
  missingAngles: Array<{
    angle: string;
    reason: string;
  }>;
}

export interface EditorialBriefSourceSummary {
  documentId: string;
  title: string;
  canonicalUrl: string;
  domain: string;
  evidenceKeys: string[];
}

export interface EditorialBriefContent extends EditorialBriefDraft {
  schemaVersion: 1;
  topicLabel: string;
  primarySources: EditorialBriefSourceSummary[];
  contextSources: EditorialBriefSourceSummary[];
  audit: {
    dossierId: string;
    candidateId: string;
    evidenceHash: string;
    promptVersion: string;
    generatorModel: string;
  };
}

export interface EditorialBriefGenerationResult {
  draft: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostMicros: number | null;
}

export interface EditorialBriefGenerator {
  readonly model: string;
  generate(input: {
    topicLabel: string;
    riskLevel: EditorialRiskLevel;
    evidence: EditorialEvidenceSnapshot[];
  }): Promise<EditorialBriefGenerationResult>;
}
