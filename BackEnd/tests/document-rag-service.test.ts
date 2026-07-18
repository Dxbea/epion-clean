import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  indexDocumentCorpus,
  searchDocumentCorpus,
  type DocumentEmbeddingProvider,
} from '../src/lib/document-corpus/document-rag-service.js';

const embedding = Array.from({ length: 1_536 }, () => 0.01);

function provider(): DocumentEmbeddingProvider {
  return {
    model: 'test-embedding-model',
    embed: vi.fn(async (texts: string[]) => ({
      embeddings: texts.map(() => embedding),
      inputTokens: texts.length * 10,
      estimatedCostMicros: texts.length * 2,
    })),
  };
}

describe('separate document corpus RAG service', () => {
  it('indexes document chunks in DocumentChunk and marks only IngestedDocument', async () => {
    const transaction = {
      documentChunk: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      ingestedDocument: { update: vi.fn(async () => ({})) },
      $executeRaw: vi.fn(async () => 1),
    };
    const client = {
      ingestedDocument: {
        findUnique: vi.fn(async () => ({
          id: 'document-1',
          title: 'Titre du document',
          content: 'Contenu documentaire vérifiable. '.repeat(100),
          contentHash: 'hash',
          storagePolicy: 'FULL_TEXT',
          duplicateOfId: null,
          isIndexed: false,
          embeddingModel: null,
          chunkingVersion: null,
        })),
      },
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaClient;

    const result = await indexDocumentCorpus(client, 'document-1', provider());

    expect(result.outcome).toBe('INDEXED');
    expect(result.chunks).toBeGreaterThan(1);
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(result.chunks);
    expect(transaction.ingestedDocument.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'document-1' },
      data: expect.objectContaining({ status: 'INDEXED', isIndexed: true }),
    }));
  });

  it('does not re-embed an already current index', async () => {
    const embeddings = provider();
    const client = {
      ingestedDocument: {
        findUnique: vi.fn(async () => ({
          id: 'document-1',
          title: 'Titre',
          content: 'Contenu',
          contentHash: 'hash',
          storagePolicy: 'FULL_TEXT',
          duplicateOfId: null,
          isIndexed: true,
          embeddingModel: embeddings.model,
          chunkingVersion: 1,
        })),
      },
    } as unknown as PrismaClient;

    await expect(indexDocumentCorpus(client, 'document-1', embeddings)).resolves.toMatchObject({
      outcome: 'ALREADY_INDEXED',
      chunks: 0,
    });
    expect(embeddings.embed).not.toHaveBeenCalled();
  });

  it('searches only the documentary index through its dedicated query', async () => {
    const embeddings = provider();
    const queryRaw = vi.fn(async () => [{ documentId: 'document-1', similarity: 0.9 }]);
    const client = { $queryRaw: queryRaw } as unknown as PrismaClient;

    const results = await searchDocumentCorpus(client, 'question', {
      provider: embeddings,
      limit: 3,
    });

    expect(results).toHaveLength(1);
    expect(embeddings.embed).toHaveBeenCalledWith(['question']);
    expect(queryRaw).toHaveBeenCalledOnce();
    const query = queryRaw.mock.calls[0][0];
    expect(query.strings.join(' ')).toContain('"DocumentChunk"');
    expect(query.strings.join(' ')).toContain("d.status = 'INDEXED'");
    expect(query.strings.join(' ')).not.toContain('"Article"');
  });
});
