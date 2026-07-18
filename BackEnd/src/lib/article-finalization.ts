import { Prisma, type PrismaClient } from '@prisma/client';
import {
  buildArticleSourceProfileSnapshot,
  buildArticleSourceUpsertInput,
  deriveArticleSourceSupportStrength,
  hashArticleSourceUrl,
  normalizeArticleSourceUrl,
} from './article-source-service.js';
import { buildArticleScorePayload, hashAnalysisInput } from './score-helpers.js';
import type { ArticleScorePayload, SourceScoreEntry } from './score-types.js';
import type { StructuredArticleContent } from '../types/structured-article.js';

export interface ArticleFinalizationInput {
  articleId: string;
  title: string;
  summary?: string | null;
  content?: string | null;
  structuredContent?: StructuredArticleContent | null;
  contentScore: number;
  sources: SourceScoreEntry[];
  liveAnalysis?: unknown | null;
  completedAt?: Date;
  replaceArticleSources?: boolean;
}

export interface ArticleFinalizationContract {
  articleId: string;
  structuredContent: StructuredArticleContent | null;
  factCheckStatus: 'COMPLETED' | 'FAILED';
  factCheckData: ArticleScorePayload;
  factCheckScore: number;
  factCheckContentHash: string;
  publicSources: SourceScoreEntry[];
  articleSourceUpserts: Prisma.ArticleSourceUpsertArgs[];
  replaceArticleSources: boolean;
  articleSourceUrlHashes: string[];
  completedAt: Date;
}

export interface ArticleFinalizationPersistenceOptions {
  afterPersist?: (
    transaction: Prisma.TransactionClient,
    contract: ArticleFinalizationContract,
  ) => Promise<void>;
}

export function isCanonicalStructuredArticleContent(value: unknown): value is StructuredArticleContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const article = value as Partial<StructuredArticleContent>;
  return article.version === 1
    && article.format === 'epion-article-v1'
    && Array.isArray(article.sections)
    && Array.isArray(article.claims);
}

export function buildArticleFinalizationContract(
  input: ArticleFinalizationInput,
): ArticleFinalizationContract {
  if (!input.articleId.trim()) throw new Error('articleId is required');
  if (!input.title.trim()) throw new Error('Article finalization requires a title');
  if (input.structuredContent && !isCanonicalStructuredArticleContent(input.structuredContent)) {
    throw new Error('Article finalization requires structuredContent in epion-article-v1 format');
  }

  const completedAt = input.completedAt ?? new Date();
  const analyzedSources = input.sources.filter((source) =>
    source.analysisStatus === 'ANALYZED' && Number.isFinite(source.trustScore) && source.trustScore > 0);
  const sourcesMean = analyzedSources.length > 0
    ? Math.round(analyzedSources.reduce((sum, source) => sum + source.trustScore, 0) / analyzedSources.length)
    : null;
  const factCheckContentHash = hashAnalysisInput({
    title: input.title,
    summary: input.summary,
    content: input.content,
    sourceDomains: input.sources.map((source) => source.domain),
  });
  const { factCheckScore, factCheckData } = buildArticleScorePayload({
    sourcesMean,
    contentScore: input.contentScore,
    contentHash: factCheckContentHash,
    sources: input.sources,
    liveAnalysis: input.liveAnalysis ?? null,
  });
  const factCheckStatus = input.sources.length > 0 ? 'COMPLETED' : 'FAILED';
  factCheckData.status = factCheckStatus;
  factCheckData.analyzedAt = completedAt.toISOString();

  const articleSourceUpserts = buildArticleSourceUpserts(input.articleId, input.sources, completedAt);
  return {
    articleId: input.articleId,
    structuredContent: input.structuredContent ?? null,
    factCheckStatus,
    factCheckData,
    factCheckScore,
    factCheckContentHash,
    publicSources: input.sources,
    articleSourceUpserts,
    replaceArticleSources: input.replaceArticleSources === true,
    articleSourceUrlHashes: input.sources.flatMap((source) => {
      const normalized = normalizeArticleSourceUrl(source.url);
      const hash = normalized ? hashArticleSourceUrl(normalized) : null;
      return source.durableSourceId && hash ? [hash] : [];
    }),
    completedAt,
  };
}

export async function persistArticleFinalization(
  client: PrismaClient,
  contract: ArticleFinalizationContract,
  options: ArticleFinalizationPersistenceOptions = {},
): Promise<ArticleFinalizationContract> {
  await client.$transaction(async (transaction) => {
    for (const upsert of contract.articleSourceUpserts) {
      await transaction.articleSource.upsert(upsert);
    }
    if (contract.replaceArticleSources) {
      await transaction.articleSource.deleteMany({
        where: {
          articleId: contract.articleId,
          ...(contract.articleSourceUrlHashes.length
            ? { sourceUrlHash: { notIn: contract.articleSourceUrlHashes } }
            : {}),
        },
      });
    }

    await transaction.article.update({
      where: { id: contract.articleId },
      data: {
        ...(contract.structuredContent
          ? { structuredContent: contract.structuredContent as unknown as Prisma.InputJsonValue }
          : {}),
        factCheckScore: contract.factCheckScore,
        factCheckData: contract.factCheckData as unknown as Prisma.InputJsonValue,
        factCheckStatus: contract.factCheckStatus,
        factCheckContentHash: contract.factCheckContentHash,
        factCheckCompletedAt: contract.completedAt,
        factCheckError: contract.factCheckStatus === 'COMPLETED'
          ? null
          : 'No sources were available for enrichment',
      },
    });
    await options.afterPersist?.(transaction, contract);
  });

  return contract;
}

export async function finalizeArticleAnalysis(
  client: PrismaClient,
  input: ArticleFinalizationInput,
  options: ArticleFinalizationPersistenceOptions = {},
): Promise<ArticleFinalizationContract> {
  const contract = buildArticleFinalizationContract(input);
  return persistArticleFinalization(client, contract, options);
}

function buildArticleSourceUpserts(
  articleId: string,
  sources: SourceScoreEntry[],
  snapshotAt: Date,
): Prisma.ArticleSourceUpsertArgs[] {
  return sources.flatMap((source, position) => {
    if (!source.durableSourceId) return [];

    const profileSnapshot = buildArticleSourceProfileSnapshot({
      profileData: source.profileData,
      profileConfidence: source.profileConfidence,
      publicTrustLabel: source.publicTrustLabel,
      lastProfiledAt: source.lastProfiledAt,
      snapshotAt,
      sourceUrl: source.url,
      actorName: source.metadata?.actorName,
      actorDescription: source.metadata?.actorDescription,
      contentTitle: source.metadata?.contentTitle,
    });
    const upsert = buildArticleSourceUpsertInput({
      articleId,
      durableSourceId: source.durableSourceId,
      sourceUrl: source.url,
      role: source.role,
      supportStrength: deriveArticleSourceSupportStrength(source.metadata?.supportStrength),
      provenance: source.provenance,
      profileSnapshot,
      profileVersion: source.profileVersion,
      snapshotAt,
      position,
      preserveExistingSnapshot: true,
    });

    return upsert ? [upsert] : [];
  });
}
