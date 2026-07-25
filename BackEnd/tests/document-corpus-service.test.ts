import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  processIngestedDocument,
  type DocumentCorpusDependencies,
} from '../src/lib/document-corpus/document-corpus-service.js';
import { extractReadableHtml, ExtractorUnsupportedContentTypeError } from '../src/lib/extractor.js';
import type { indexDocumentCorpus } from '../src/lib/document-corpus/document-rag-service.js';

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: 'document-1',
    canonicalUrl: 'https://example.com/article',
    title: 'Titre découvert',
    snippet: 'Résumé découvert',
    content: null,
    contentHash: null,
    status: 'DISCOVERED',
    accessPolicy: 'ROBOTS_ALLOWED',
    storagePolicy: 'FULL_TEXT',
    licenseDecision: null,
    duplicateOfId: null,
    isIndexed: false,
    ...overrides,
  };
}

function clientFor(
  loadedDocument: ReturnType<typeof document>,
  canonicalDocumentId = loadedDocument.id,
) {
  const transaction = {
    documentContentIdentity: {
      createMany: vi.fn(async () => ({ count: canonicalDocumentId === loadedDocument.id ? 1 : 0 })),
      findUnique: vi.fn(async () => ({ canonicalDocumentId })),
    },
    ingestedDocument: { update: vi.fn(async () => ({})) },
  };
  const client = {
    ingestedDocument: {
      findUnique: vi.fn(async () => loadedDocument),
      update: vi.fn(async () => ({})),
    },
    $transaction: vi.fn(async (operation) => operation(transaction)),
  } as unknown as PrismaClient;
  return { client, transaction };
}

function successfulIndex() {
  return vi.fn(async () => ({
    outcome: 'INDEXED' as const,
    chunks: 3,
    inputTokens: 120,
    estimatedCostMicros: 4,
  })) as unknown as typeof indexDocumentCorpus;
}

describe('document fetch, extraction and exact deduplication service', () => {
  it('blocks before extraction when robots denies the URL', async () => {
    const { client } = clientFor(document());
    const extractor = vi.fn();
    const robotsChecker = {
      check: vi.fn(async () => ({
        allowed: false,
        retryable: false,
        checkedAt: new Date('2026-07-18T12:00:00Z'),
        reason: 'robots_disallowed',
        robotsUrl: 'https://example.com/robots.txt',
      })),
    };

    await expect(processIngestedDocument({ client, extractor, robotsChecker }, 'document-1'))
      .resolves.toMatchObject({ outcome: 'BLOCKED', reason: 'robots_disallowed' });
    expect(extractor).not.toHaveBeenCalled();
    expect(client.ingestedDocument.update).toHaveBeenLastCalledWith({
      where: { id: 'document-1' },
      data: { status: 'BLOCKED', fetchError: 'robots_disallowed' },
    });
  });

  it('fails retryably instead of permanently blocking when robots is unavailable', async () => {
    const { client } = clientFor(document());
    await expect(processIngestedDocument({
      client,
      robotsChecker: {
        check: vi.fn(async () => ({
          allowed: false,
          retryable: true,
          checkedAt: new Date('2026-07-18T12:00:00Z'),
          reason: 'robots_unavailable',
          robotsUrl: 'https://example.com/robots.txt',
        })),
      },
    }, 'document-1')).rejects.toThrow('Temporary robots check failure');
    expect(client.ingestedDocument.update).toHaveBeenLastCalledWith({
      where: { id: 'document-1' },
      data: { status: 'FAILED', fetchError: 'Temporary robots check failure: robots_unavailable' },
    });
  });

  it('extracts, hashes, persists and indexes an Inserm-like allowed HTML document', async () => {
    const { client, transaction } = clientFor(document());
    const indexDocument = successfulIndex();
    const dependencies: DocumentCorpusDependencies = {
      client,
      robotsChecker: {
        check: vi.fn(async () => ({
          allowed: true,
          retryable: false,
          checkedAt: new Date('2026-07-18T12:00:00Z'),
          reason: 'robots_allowed',
          robotsUrl: 'https://example.com/robots.txt',
        })),
      },
      extractor: vi.fn(async () => extractReadableHtml(`
        <html><head><title>Inserm - Recherche</title><meta name="description" content="Description Inserm" /></head>
        <body><article><h1>Titre extrait</h1><p>${'Un contenu documentaire complet et vérifiable sur une étude Inserm. '.repeat(30)}</p></article></body></html>
      `, 'https://www.inserm.fr/actualite/test/')),
      indexDocument,
      now: () => new Date('2026-07-18T12:00:00Z'),
    };

    const result = await processIngestedDocument(dependencies, 'document-1');

    expect(result).toMatchObject({ outcome: 'INDEXED', chunks: 3, inputTokens: 120 });
    expect(result.extractedCharacters).toBeGreaterThan(1_500);
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(transaction.documentContentIdentity.createMany).toHaveBeenCalledWith({
      data: [{ contentHash: result.contentHash, canonicalDocumentId: 'document-1' }],
      skipDuplicates: true,
    });
    expect(transaction.documentContentIdentity.findUnique).toHaveBeenCalledWith({
      where: { contentHash: result.contentHash },
      select: { canonicalDocumentId: true },
    });
    expect(transaction.ingestedDocument.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'EXTRACTED',
        extractionMethod: 'READABILITY',
        contentHash: result.contentHash,
      }),
    }));
    expect(indexDocument).toHaveBeenCalledOnce();
  });

  it('persists an explicit FAILED diagnostic when extraction receives an empty HTTP body', async () => {
    const { client } = clientFor(document({ canonicalUrl: 'https://www.inserm.fr/actualite/test/' }));
    const extractor = vi.fn(async () => {
      throw new Error('Extraction returned empty HTML (fetcher=axios, status=200, finalUrl=https://www.inserm.fr/actualite/test/, contentType=text/html, contentLength=0, bodyLength=0, userAgent=EpionBot/1.0)');
    });
    await expect(processIngestedDocument({
      client,
      robotsChecker: { check: vi.fn(async () => ({ allowed: true, retryable: false, checkedAt: new Date(), reason: 'robots_allowed', robotsUrl: 'https://www.inserm.fr/robots.txt' })) },
      extractor,
    }, 'document-1')).rejects.toThrow('Extraction returned empty HTML');
    expect(client.ingestedDocument.update).toHaveBeenLastCalledWith({
      where: { id: 'document-1' },
      data: expect.objectContaining({ status: 'FAILED', fetchError: expect.stringContaining('status=200') }),
    });
  });

  it('marks an unsupported PDF as terminal PARTIAL instead of retrying into the DLQ', async () => {
    const { client } = clientFor(document({ canonicalUrl: 'https://example.com/press-release.pdf' }));
    await expect(processIngestedDocument({
      client,
      robotsChecker: { check: vi.fn(async () => ({ allowed: true, retryable: false, checkedAt: new Date(), reason: 'robots_allowed', robotsUrl: 'https://example.com/robots.txt' })) },
      extractor: vi.fn(async () => { throw new ExtractorUnsupportedContentTypeError('application/pdf', 'https://example.com/press-release.pdf'); }),
    }, 'document-1')).resolves.toMatchObject({ outcome: 'PARTIAL', reason: 'UNSUPPORTED_CONTENT_TYPE' });
    expect(client.ingestedDocument.update).toHaveBeenLastCalledWith({ where: { id: 'document-1' }, data: { status: 'PARTIAL', fetchError: 'UNSUPPORTED_CONTENT_TYPE:application/pdf' } });
  });

  it('marks a concurrent exact-content identity winner as canonical and skips embeddings', async () => {
    const { client, transaction } = clientFor(document(), 'document-canonical');
    const indexDocument = successfulIndex();

    const result = await processIngestedDocument({
      client,
      robotsChecker: {
        check: vi.fn(async () => ({
          allowed: true,
          retryable: false,
          checkedAt: new Date(),
          reason: 'robots_allowed',
          robotsUrl: 'https://example.com/robots.txt',
        })),
      },
      extractor: vi.fn(async () => ({
        title: 'Copie',
        content: 'Même contenu exact suffisamment long. '.repeat(20),
      })),
      indexDocument,
    }, 'document-1');

    expect(result).toMatchObject({
      outcome: 'DUPLICATE',
      duplicateOfId: 'document-canonical',
    });
    expect(transaction.ingestedDocument.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: null, duplicateOfId: 'document-canonical' }),
    }));
    expect(indexDocument).not.toHaveBeenCalled();
  });

  it('resumes from EXTRACTED without fetching again after an embedding failure', async () => {
    const loaded = document({
      status: 'EXTRACTED',
      content: 'Contenu déjà persisté',
      contentHash: 'existing-hash',
    });
    const { client } = clientFor(loaded);
    const extractor = vi.fn();
    const indexDocument = successfulIndex();

    await expect(processIngestedDocument({ client, extractor, indexDocument }, 'document-1'))
      .resolves.toMatchObject({ outcome: 'INDEXED', contentHash: 'existing-hash' });
    expect(extractor).not.toHaveBeenCalled();
    expect(indexDocument).toHaveBeenCalledOnce();
  });

  it('processes transient content without storing text or creating embeddings', async () => {
    const { client, transaction } = clientFor(document({
      accessPolicy: 'OFFICIAL_API',
      storagePolicy: 'TRANSIENT',
    }));
    const indexDocument = successfulIndex();

    const result = await processIngestedDocument({
      client,
      extractor: vi.fn(async () => ({ title: 'API', content: 'Contenu API temporaire' })),
      indexDocument,
    }, 'document-1');

    expect(result.outcome).toBe('TRANSIENT_PROCESSED');
    expect(client.ingestedDocument.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: null, status: 'FETCHED' }),
    }));
    expect(transaction.documentContentIdentity.createMany).not.toHaveBeenCalled();
    expect(indexDocument).not.toHaveBeenCalled();
  });
});
