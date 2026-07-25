export type ArticleGenerationMode = 'USER_REQUEST' | 'AUTO_EDITORIAL';

export type EvidenceRole = 'PRIMARY' | 'CONTEXT' | 'COUNTERPOINT' | 'BACKGROUND';
export type EvidenceStatus = 'FOUND' | 'PERSISTED' | 'INDEXED' | 'USED';
export type EvidenceProvenance =
  | 'RSS'
  | 'ATOM'
  | 'SITEMAP'
  | 'GDELT'
  | 'GOOGLE_NEWS_RSS'
  | 'SERPER'
  | 'MANUAL';
export type EvidenceTraceability = 'COMPLETE' | 'DEGRADED';

export interface EvidenceBudget {
  minimumSources: number;
  minimumDomains: number;
  maximumSources: number;
  maximumPaidQueries: number;
}

export interface DiscoveryBudget {
  lowCostFirst: boolean;
  maximumDocuments: number;
  maximumQueries: number;
  allowedProvenances: EvidenceProvenance[];
}

export interface LatencyPolicy {
  deadlineMs: number;
  corpusWaitMs: number;
  allowDegradedDraft: boolean;
}

export interface PublicationPolicy {
  draftOnly: boolean;
  minimumArticleSources: number;
  minimumIndependentDomains: number;
  requireVerificationPassed: boolean;
  requireCompleteFactScore: boolean;
  requireCategory: boolean;
}

export interface ArticleGenerationPolicy {
  evidence: EvidenceBudget;
  discovery: DiscoveryBudget;
  latency: LatencyPolicy;
  publication: PublicationPolicy;
}

export interface ArticleGenerationPolicyOverrides {
  evidence?: Partial<EvidenceBudget>;
  discovery?: Partial<DiscoveryBudget>;
  latency?: Partial<LatencyPolicy>;
  publication?: Partial<PublicationPolicy>;
}

export interface ArticleGenerationRequest {
  mode: ArticleGenerationMode;
  topic: string;
  language?: string;
  country?: string;
  style?: string;
  policy?: ArticleGenerationPolicyOverrides;
}

export interface EvidenceItem {
  ingestedDocumentId: string | null;
  chunkIds: string[];
  sourceId: string | null;
  canonicalUrl: string;
  domain: string;
  title: string | null;
  role: EvidenceRole;
  status: EvidenceStatus;
  claimKeys: string[];
  provenance: EvidenceProvenance;
  traceability: EvidenceTraceability;
}

export interface EvidenceDossier {
  mode: ArticleGenerationMode;
  items: EvidenceItem[];
  traceability: EvidenceTraceability;
  degradedReasons: string[];
  persistedDocuments: number;
  indexedDocuments: number;
  usedEvidenceItems: number;
}
