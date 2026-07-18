import type {
  EditorialCandidateStatus,
  EditorialRiskLevel,
  EditorialTopicDocumentRole,
} from '@prisma/client';

export const EDITORIAL_CLUSTERING_ALGORITHM_VERSION = 'event-clustering-v1';

export interface EditorialDocumentVector {
  id: string;
  title: string;
  domain: string;
  language: string | null;
  sourceId: string | null;
  categoryId: string | null;
  eventAt: Date;
  embedding: number[];
}

export interface EditorialClusteringConfig {
  topicSimilarityThreshold: number;
  quasiDuplicateSimilarityThreshold: number;
  quasiDuplicateTitleThreshold: number;
  maxEventGapHours: number;
  minProposalDocuments: number;
  minProposalDomains: number;
  proposalScoreThreshold: number;
  maxDocuments: number;
}

export interface EditorialClusterMember {
  document: EditorialDocumentVector;
  role: EditorialTopicDocumentRole;
  similarityToCentroid: number;
  quasiDuplicateOfDocumentId: string | null;
}

export interface EditorialCluster {
  clusterKey: string;
  label: string;
  language: string | null;
  dominantCategoryId: string | null;
  dominantSourceId: string | null;
  representativeDocumentId: string;
  firstEventAt: Date;
  latestEventAt: Date;
  centroid: number[];
  members: EditorialClusterMember[];
}

export interface EditorialScore {
  status: EditorialCandidateStatus;
  editorialScore: number;
  freshnessScore: number;
  sourceDiversityScore: number;
  independentDomainScore: number;
  coverageScore: number;
  relevanceScore: number;
  riskScore: number;
  riskLevel: EditorialRiskLevel;
  independentDomains: number;
  independentSources: number;
  evidenceDocuments: number;
  quasiDuplicates: number;
  rationale: {
    proposalEligible: boolean;
    reasons: string[];
    weights: Record<string, number>;
    signals: {
      independentDomains: number;
      independentSources: number;
      evidenceDocuments: number;
      quasiDuplicates: number;
    };
  };
}

export const DEFAULT_EDITORIAL_CLUSTERING_CONFIG: EditorialClusteringConfig = {
  topicSimilarityThreshold: 0.78,
  quasiDuplicateSimilarityThreshold: 0.94,
  quasiDuplicateTitleThreshold: 0.7,
  maxEventGapHours: 72,
  minProposalDocuments: 2,
  minProposalDomains: 2,
  proposalScoreThreshold: 55,
  maxDocuments: 500,
};
