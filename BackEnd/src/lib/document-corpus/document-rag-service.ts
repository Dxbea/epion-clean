import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import logger from '../logger.js';
import {
  chunkDocumentContent,
  DOCUMENT_CHUNKING_VERSION,
  type DocumentChunkCandidate,
} from './content.js';

export const DOCUMENT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DOCUMENT_EMBEDDING_DIMENSIONS = 1_536;
const MAX_EMBEDDING_BATCH_SIZE = 100;
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

const ragLog = logger.child({ module: 'DocumentCorpusRAG' });

export interface DocumentEmbeddingBatch {
  embeddings: number[][];
  inputTokens: number | null;
  estimatedCostMicros: number | null;
}

export interface DocumentEmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<DocumentEmbeddingBatch>;
}

export interface DocumentIndexResult {
  outcome: 'INDEXED' | 'ALREADY_INDEXED' | 'SKIPPED_DUPLICATE' | 'SKIPPED_POLICY';
  chunks: number;
  inputTokens: number | null;
  estimatedCostMicros: number | null;
}

export interface DocumentSearchResult {
  documentId: string;
  canonicalUrl: string;
  domain: string;
  title: string | null;
  publishedAt: Date | null;
  content: string;
  similarity: number;
}

export class OpenAIDocumentEmbeddingProvider implements DocumentEmbeddingProvider {
  readonly model = DOCUMENT_EMBEDDING_MODEL;
  private readonly client: OpenAI;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    this.client = new OpenAI({ apiKey });
  }

  async embed(texts: string[]): Promise<DocumentEmbeddingBatch> {
    if (texts.length === 0) {
      return { embeddings: [], inputTokens: 0, estimatedCostMicros: 0 };
    }

    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });
    const embeddings = response.data
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
    const inputTokens = response.usage?.prompt_tokens ?? null;

    return {
      embeddings,
      inputTokens,
      estimatedCostMicros: estimateEmbeddingCost(inputTokens),
    };
  }
}

export async function indexDocumentCorpus(
  client: PrismaClient,
  documentId: string,
  provider: DocumentEmbeddingProvider = new OpenAIDocumentEmbeddingProvider(),
): Promise<DocumentIndexResult> {
  const document = await client.ingestedDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      content: true,
      contentHash: true,
      storagePolicy: true,
      duplicateOfId: true,
      isIndexed: true,
      embeddingModel: true,
      chunkingVersion: true,
    },
  });
  if (!document) throw new Error(`IngestedDocument not found: ${documentId}`);
  if (document.duplicateOfId) return skipped('SKIPPED_DUPLICATE');
  if (!['FULL_TEXT', 'EXCERPT_ONLY'].includes(document.storagePolicy) || !document.content) {
    return skipped('SKIPPED_POLICY');
  }
  if (
    document.isIndexed &&
    document.embeddingModel === provider.model &&
    document.chunkingVersion === DOCUMENT_CHUNKING_VERSION
  ) {
    return skipped('ALREADY_INDEXED');
  }

  const chunks = chunkDocumentContent(document.title, document.content);
  if (chunks.length === 0) return skipped('SKIPPED_POLICY');

  const embeddingResult = await embedInBatches(provider, chunks);
  validateEmbeddings(chunks, embeddingResult.embeddings);

  await client.$transaction(async (transaction) => {
    await transaction.documentChunk.deleteMany({ where: { documentId } });
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      const vector = `[${embeddingResult.embeddings[index].join(',')}]`;
      await transaction.$executeRaw`
        INSERT INTO "DocumentChunk" (
          "id", "documentId", "position", "content", "contentHash",
          "estimatedTokens", "embedding", "embeddingModel", "chunkingVersion",
          "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${documentId}, ${chunk.position}, ${chunk.content}, ${chunk.contentHash},
          ${chunk.estimatedTokens}, ${vector}::vector, ${provider.model},
          ${DOCUMENT_CHUNKING_VERSION}, NOW(), NOW()
        )
      `;
    }
    await transaction.ingestedDocument.update({
      where: { id: documentId },
      data: {
        status: 'INDEXED',
        isIndexed: true,
        indexedAt: new Date(),
        embeddingModel: provider.model,
        chunkingVersion: DOCUMENT_CHUNKING_VERSION,
        embeddingTokenCount: embeddingResult.inputTokens,
        fetchError: null,
      },
    });
  });

  ragLog.info('Document corpus indexed', {
    documentId,
    chunks: chunks.length,
    inputTokens: embeddingResult.inputTokens,
    estimatedCostMicros: embeddingResult.estimatedCostMicros,
    embeddingModel: provider.model,
  });
  return {
    outcome: 'INDEXED',
    chunks: chunks.length,
    inputTokens: embeddingResult.inputTokens,
    estimatedCostMicros: embeddingResult.estimatedCostMicros,
  };
}

export async function searchDocumentCorpus(
  client: PrismaClient,
  query: string,
  options: {
    limit?: number;
    similarityThreshold?: number;
    provider?: DocumentEmbeddingProvider;
  } = {},
): Promise<DocumentSearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const provider = options.provider ?? new OpenAIDocumentEmbeddingProvider();
  const embedded = await provider.embed([normalizedQuery]);
  validateEmbedding(embedded.embeddings[0]);
  const vector = `[${embedded.embeddings[0].join(',')}]`;
  const limit = Math.min(50, Math.max(1, Math.floor(options.limit ?? 5)));
  const threshold = Math.min(1, Math.max(0, options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD));

  return client.$queryRaw<DocumentSearchResult[]>(Prisma.sql`
    SELECT
      d.id AS "documentId",
      d."canonicalUrl",
      d.domain,
      d.title,
      d."publishedAt",
      dc.content,
      1 - (dc.embedding <=> ${vector}::vector) AS similarity
    FROM "DocumentChunk" dc
    JOIN "IngestedDocument" d ON d.id = dc."documentId"
    WHERE dc.embedding IS NOT NULL
      AND d.status = 'INDEXED'
      AND d."duplicateOfId" IS NULL
      AND dc."embeddingModel" = ${provider.model}
      AND 1 - (dc.embedding <=> ${vector}::vector) >= ${threshold}
    ORDER BY dc.embedding <=> ${vector}::vector
    LIMIT ${limit}
  `);
}

async function embedInBatches(
  provider: DocumentEmbeddingProvider,
  chunks: DocumentChunkCandidate[],
): Promise<DocumentEmbeddingBatch> {
  const combined: DocumentEmbeddingBatch = {
    embeddings: [],
    inputTokens: 0,
    estimatedCostMicros: 0,
  };
  let tokensKnown = true;
  let costKnown = true;

  for (let offset = 0; offset < chunks.length; offset += MAX_EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(offset, offset + MAX_EMBEDDING_BATCH_SIZE);
    const result = await provider.embed(batch.map((chunk) => chunk.content));
    combined.embeddings.push(...result.embeddings);
    if (result.inputTokens === null) tokensKnown = false;
    else combined.inputTokens = (combined.inputTokens ?? 0) + result.inputTokens;
    if (result.estimatedCostMicros === null) costKnown = false;
    else combined.estimatedCostMicros = (combined.estimatedCostMicros ?? 0) + result.estimatedCostMicros;
  }

  if (!tokensKnown) combined.inputTokens = null;
  if (!costKnown) combined.estimatedCostMicros = null;
  return combined;
}

function validateEmbeddings(chunks: DocumentChunkCandidate[], embeddings: number[][]): void {
  if (chunks.length !== embeddings.length) {
    throw new Error(`Embedding count mismatch: expected ${chunks.length}, received ${embeddings.length}`);
  }
  embeddings.forEach(validateEmbedding);
}

function validateEmbedding(embedding: number[] | undefined): void {
  if (!embedding || embedding.length !== DOCUMENT_EMBEDDING_DIMENSIONS) {
    throw new Error(`Document embeddings must contain ${DOCUMENT_EMBEDDING_DIMENSIONS} dimensions`);
  }
}

function estimateEmbeddingCost(inputTokens: number | null): number | null {
  if (inputTokens === null) return null;
  const rawRate = process.env.DOCUMENT_EMBEDDING_COST_MICROS_PER_MILLION_TOKENS;
  if (!rawRate) return null;
  const rate = Number(rawRate);
  if (!Number.isFinite(rate) || rate < 0) return null;
  return Math.round((inputTokens * rate) / 1_000_000);
}

function skipped(outcome: DocumentIndexResult['outcome']): DocumentIndexResult {
  return { outcome, chunks: 0, inputTokens: null, estimatedCostMicros: null };
}
