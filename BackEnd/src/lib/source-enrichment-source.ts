import type { RichTrustScore } from './trust-score.js';
import type { SourceAnalysisStatus, SourceScoreEntry } from './score-types.js';
import type { ArticleSourceProvenanceValue, ArticleSourceRoleValue } from './article-source-service.js';
import type { SourceSearchLane } from './live-analysis/types.js';
import { stableSourceId } from './structured-article.js';

export interface SourceEnrichmentMetadata {
  extractionStatus?: string;
  provider?: 'web' | 'rag';
  searchLane?: SourceSearchLane;
  role?: ArticleSourceRoleValue;
  provenance?: ArticleSourceProvenanceValue;
  officialStatement?: boolean;
  actorName?: string;
  actorDescription?: string;
  contentTitle?: string;
}

export function buildEnrichedSourceScoreEntry(input: {
  url: string;
  index: number;
  domain: string;
  richScore: RichTrustScore;
  analysisStatus: SourceAnalysisStatus;
  metadata?: SourceEnrichmentMetadata;
}): SourceScoreEntry {
  const { url, index, domain, richScore, analysisStatus, metadata } = input;

  return {
    id: 0,
    sourceId: stableSourceId(url, index),
    durableSourceId: richScore.durableSourceId,
    name: richScore.metadata.name,
    url,
    domain,
    trustScore: richScore.globalScore,
    type: richScore.metadata.type,
    logo: `https://logo.clearbit.com/${domain}`,
    description: richScore.metadata.description ?? null,
    justification: richScore.metadata.justification,
    metrics: richScore.details
      ? {
          transparency: richScore.details.transparency,
          editorial: richScore.details.editorial,
          semantic: richScore.details.semantic,
          logic: richScore.details.pluralism,
        }
      : null,
    flags: richScore.flags ?? null,
    analysisStatus,
    extractionStatus: metadata?.extractionStatus === 'metadata_only' ? 'metadata_only' : 'full',
    provider: metadata?.provider,
    searchLane: metadata?.searchLane,
    role: metadata?.role,
    provenance: metadata?.provenance,
    officialStatement: metadata?.officialStatement,
    profileData: richScore.profileData,
    profileVersion: richScore.profileVersion,
    profileConfidence: richScore.profileConfidence,
    lastProfiledAt: richScore.lastProfiledAt,
    publicTrustLabel: richScore.publicTrustLabel,
    metadata: {
      reliability: richScore.metadata.reliability,
      dbScore: richScore.globalScore,
      politicalBias: richScore.metadata.politicalBias,
      biasScore: richScore.metadata.biasScore,
      explanation: richScore.metadata.explanation,
      actorName: metadata?.actorName,
      actorDescription: metadata?.actorDescription,
      contentTitle: metadata?.contentTitle,
    },
  };
}
