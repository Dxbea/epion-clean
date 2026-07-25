import type { PrismaClient } from '@prisma/client';
import {
  extractArticle,
  ExtractorUnsupportedContentTypeError,
  type ExtractedDocument,
  type ExtractLogContext,
} from '../extractor.js';
import logger from '../logger.js';
import { evaluateDocumentPolicy } from './access-policy.js';
import {
  createDocumentExcerpt,
  hashDocumentContent,
  normalizeDocumentContent,
} from './content.js';
import {
  indexDocumentCorpus,
  type DocumentEmbeddingProvider,
  type DocumentIndexResult,
} from './document-rag-service.js';
import { RobotsChecker, type RobotsDecision } from './robots.js';

const corpusLog = logger.child({ module: 'DocumentCorpus' });

export type DocumentCorpusOutcome =
  | 'INDEXED'
  | 'ALREADY_INDEXED'
  | 'BLOCKED'
  | 'PARTIAL'
  | 'TRANSIENT_PROCESSED'
  | 'DUPLICATE';

export interface DocumentCorpusResult {
  documentId: string;
  outcome: DocumentCorpusOutcome;
  reason: string | null;
  contentHash: string | null;
  duplicateOfId: string | null;
  extractedCharacters: number;
  chunks: number;
  inputTokens: number | null;
  estimatedCostMicros: number | null;
}

export interface DocumentCorpusDependencies {
  client: PrismaClient;
  robotsChecker?: Pick<RobotsChecker, 'check'>;
  extractor?: (url: string, context?: ExtractLogContext) => Promise<ExtractedDocument>;
  embeddingProvider?: DocumentEmbeddingProvider;
  indexDocument?: typeof indexDocumentCorpus;
  now?: () => Date;
}

export async function processIngestedDocument(
  dependencies: DocumentCorpusDependencies,
  documentId: string,
  context: ExtractLogContext = {},
): Promise<DocumentCorpusResult> {
  const now = dependencies.now ?? (() => new Date());
  const client = dependencies.client;
  const document = await client.ingestedDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      canonicalUrl: true,
      title: true,
      snippet: true,
      content: true,
      contentHash: true,
      status: true,
      accessPolicy: true,
      storagePolicy: true,
      licenseDecision: true,
      duplicateOfId: true,
      isIndexed: true,
    },
  });
  if (!document) throw new Error(`IngestedDocument not found: ${documentId}`);

  if (document.duplicateOfId) {
    return result(documentId, 'DUPLICATE', 'exact_content_duplicate', {
      contentHash: document.contentHash,
      duplicateOfId: document.duplicateOfId,
    });
  }
  if (document.isIndexed && document.status === 'INDEXED') {
    return result(documentId, 'ALREADY_INDEXED', null, {
      contentHash: document.contentHash,
    });
  }

  const policy = evaluateDocumentPolicy(document);
  if (policy.acquisition === 'BLOCK') {
    await client.ingestedDocument.update({
      where: { id: documentId },
      data: { status: 'BLOCKED', fetchError: policy.reason },
    });
    return result(documentId, 'BLOCKED', policy.reason);
  }

  if (
    document.status === 'EXTRACTED' &&
    document.content &&
    document.contentHash &&
    policy.shouldIndex
  ) {
    return indexExistingDocument(dependencies, documentId, document.contentHash);
  }

  await client.ingestedDocument.update({
    where: { id: documentId },
    data: {
      status: 'FETCH_PENDING',
      lastFetchAttemptAt: now(),
      fetchAttempts: { increment: 1 },
      fetchError: null,
    },
  });

  let extractionPersisted = false;
  try {
    let robotsDecision: RobotsDecision | null = null;
    if (policy.requiresRobotsCheck) {
      const robotsChecker = dependencies.robotsChecker ?? new RobotsChecker();
      robotsDecision = await robotsChecker.check(document.canonicalUrl);
      await client.ingestedDocument.update({
        where: { id: documentId },
        data: {
          robotsAllowed: robotsDecision.allowed,
          robotsCheckedAt: robotsDecision.checkedAt,
        },
      });
      if (!robotsDecision.allowed) {
        if (robotsDecision.retryable) {
          throw new Error(`Temporary robots check failure: ${robotsDecision.reason}`);
        }
        await client.ingestedDocument.update({
          where: { id: documentId },
          data: { status: 'BLOCKED', fetchError: robotsDecision.reason },
        });
        return result(documentId, 'BLOCKED', robotsDecision.reason);
      }
    }

    const extracted = policy.acquisition === 'USE_EXISTING'
      ? existingFeedDocument(document.title, document.content, document.snippet)
      : await (dependencies.extractor ?? extractArticle)(document.canonicalUrl, context);
    const normalizedContent = normalizeDocumentContent(extracted.content);
    if (!normalizedContent) {
      await client.ingestedDocument.update({
        where: { id: documentId },
        data: { status: 'PARTIAL', fetchError: 'empty_extracted_content' },
      });
      return result(documentId, 'PARTIAL', 'empty_extracted_content');
    }

    const contentHash = hashDocumentContent(normalizedContent);
    const persistedContent = policy.persistence === 'FULL'
      ? normalizedContent
      : policy.persistence === 'EXCERPT'
        ? createDocumentExcerpt(normalizedContent)
        : null;

    if (!persistedContent) {
      await client.ingestedDocument.update({
        where: { id: documentId },
        data: {
          title: extracted.title || document.title,
          snippet: extracted.metaDescription ?? document.snippet,
          content: null,
          contentHash,
          duplicateOfId: null,
          extractionMethod: policy.acquisition === 'USE_EXISTING' ? 'FEED' : 'READABILITY',
          fetchedAt: now(),
          status: 'FETCHED',
          fetchError: null,
          isIndexed: false,
          indexedAt: null,
          embeddingModel: null,
          chunkingVersion: null,
          embeddingTokenCount: null,
        },
      });
      extractionPersisted = true;
      return result(documentId, 'TRANSIENT_PROCESSED', policy.reason, {
        contentHash,
        extractedCharacters: normalizedContent.length,
      });
    }

    const identity = await client.$transaction(async (transaction) => {
      await transaction.documentContentIdentity.createMany({
        data: [{ contentHash, canonicalDocumentId: documentId }],
        skipDuplicates: true,
      });
      const fingerprint = await transaction.documentContentIdentity.findUnique({
        where: { contentHash },
        select: { canonicalDocumentId: true },
      });
      if (!fingerprint) {
        throw new Error(`Unable to resolve exact-content identity: ${contentHash}`);
      }
      const duplicateOfId = fingerprint.canonicalDocumentId === documentId
        ? null
        : fingerprint.canonicalDocumentId;
      await transaction.ingestedDocument.update({
        where: { id: documentId },
        data: {
          title: extracted.title || document.title,
          snippet: extracted.metaDescription ?? document.snippet,
          content: duplicateOfId ? null : persistedContent,
          contentHash,
          duplicateOfId,
          extractionMethod: policy.acquisition === 'USE_EXISTING' ? 'FEED' : 'READABILITY',
          fetchedAt: now(),
          status: persistedContent ? 'EXTRACTED' : 'FETCHED',
          fetchError: null,
          isIndexed: false,
          indexedAt: null,
          embeddingModel: null,
          chunkingVersion: null,
          embeddingTokenCount: null,
        },
      });
      return { duplicateOfId };
    });
    extractionPersisted = true;

    if (identity.duplicateOfId) {
      corpusLog.info('Exact duplicate document detected', {
        documentId,
        duplicateOfId: identity.duplicateOfId,
        contentHash,
      });
      return result(documentId, 'DUPLICATE', 'exact_content_duplicate', {
        contentHash,
        duplicateOfId: identity.duplicateOfId,
        extractedCharacters: normalizedContent.length,
      });
    }
    return indexExistingDocument(
      dependencies,
      documentId,
      contentHash,
      normalizedContent.length,
    );
  } catch (error) {
    if (error instanceof ExtractorUnsupportedContentTypeError) {
      await client.ingestedDocument.update({
        where: { id: documentId },
        data: { status: 'PARTIAL', fetchError: `UNSUPPORTED_CONTENT_TYPE:${error.contentType}` },
      });
      return result(documentId, 'PARTIAL', 'UNSUPPORTED_CONTENT_TYPE');
    }
    const message = errorMessage(error).slice(0, 1_000);
    await client.ingestedDocument.update({
      where: { id: documentId },
      data: {
        status: extractionPersisted ? 'EXTRACTED' : 'FAILED',
        fetchError: message,
      },
    }).catch((stateError) => {
      corpusLog.error('Failed to persist document processing failure', {
        documentId,
        error: errorMessage(stateError),
      });
    });
    throw error;
  }
}

async function indexExistingDocument(
  dependencies: DocumentCorpusDependencies,
  documentId: string,
  contentHash: string,
  extractedCharacters = 0,
): Promise<DocumentCorpusResult> {
  const indexDocument = dependencies.indexDocument ?? indexDocumentCorpus;
  const indexed: DocumentIndexResult = await indexDocument(
    dependencies.client,
    documentId,
    dependencies.embeddingProvider,
  );
  const outcome: DocumentCorpusOutcome = indexed.outcome === 'ALREADY_INDEXED'
    ? 'ALREADY_INDEXED'
    : indexed.outcome === 'SKIPPED_DUPLICATE'
      ? 'DUPLICATE'
      : indexed.outcome === 'SKIPPED_POLICY'
        ? 'BLOCKED'
        : 'INDEXED';
  return result(
    documentId,
    outcome,
    indexed.outcome === 'SKIPPED_POLICY' ? 'storage_policy_not_indexable' : null,
    {
      contentHash,
      extractedCharacters,
      chunks: indexed.chunks,
      inputTokens: indexed.inputTokens,
      estimatedCostMicros: indexed.estimatedCostMicros,
    },
  );
}

function existingFeedDocument(
  title: string | null,
  content: string | null,
  snippet: string | null,
): ExtractedDocument {
  return {
    title: title ?? 'Untitled',
    content: content ?? snippet ?? '',
    metaDescription: snippet ?? undefined,
  };
}

function result(
  documentId: string,
  outcome: DocumentCorpusOutcome,
  reason: string | null,
  values: Partial<Omit<DocumentCorpusResult, 'documentId' | 'outcome' | 'reason'>> = {},
): DocumentCorpusResult {
  return {
    documentId,
    outcome,
    reason,
    contentHash: values.contentHash ?? null,
    duplicateOfId: values.duplicateOfId ?? null,
    extractedCharacters: values.extractedCharacters ?? 0,
    chunks: values.chunks ?? 0,
    inputTokens: values.inputTokens ?? null,
    estimatedCostMicros: values.estimatedCostMicros ?? null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
