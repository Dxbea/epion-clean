/**
 * RAG Service - Epion Energy
 * Handles article ingestion: chunking, embedding, and vector storage
 */

import OpenAI from 'openai';
import { prisma } from './db';
import { Prisma } from '@prisma/client';
import { logger } from './logger';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_CHUNK_SIZE = 1000;
const MIN_CHUNK_SIZE = 50;
const SIMILARITY_THRESHOLD = 0.7;

// -----------------------------------------------------------------------------
// Utility: Chunk Text
// -----------------------------------------------------------------------------
/**
 * Splits a long text into smaller chunks suitable for embedding.
 * Strategy: Split by paragraphs, then by sentences if too long.
 */
export function chunkText(text: string): string[] {
    if (!text || text.trim().length === 0) {
        return [];
    }

    const chunks: string[] = [];

    // Split by double newlines first (paragraph breaks)
    const paragraphs = text.split(/\n\n+/);

    for (const paragraph of paragraphs) {
        const trimmed = paragraph.trim();

        // Skip empty or too short paragraphs
        if (trimmed.length < MIN_CHUNK_SIZE) {
            continue;
        }

        // If paragraph fits, add it directly
        if (trimmed.length <= MAX_CHUNK_SIZE) {
            chunks.push(trimmed);
            continue;
        }

        // Paragraph too long: split by single newlines or sentences
        const lines = trimmed.split(/\n+/);
        let currentChunk = '';

        for (const line of lines) {
            const lineText = line.trim();
            if (!lineText) continue;

            // If adding this line would exceed max, save current and start new
            if (currentChunk.length + lineText.length + 1 > MAX_CHUNK_SIZE) {
                if (currentChunk.length >= MIN_CHUNK_SIZE) {
                    chunks.push(currentChunk.trim());
                }

                // If single line is too long, split it brutally
                if (lineText.length > MAX_CHUNK_SIZE) {
                    const brutChunks = splitBrutally(lineText, MAX_CHUNK_SIZE);
                    chunks.push(...brutChunks.filter(c => c.length >= MIN_CHUNK_SIZE));
                    currentChunk = '';
                } else {
                    currentChunk = lineText;
                }
            } else {
                currentChunk += (currentChunk ? ' ' : '') + lineText;
            }
        }

        // Don't forget remaining content
        if (currentChunk.length >= MIN_CHUNK_SIZE) {
            chunks.push(currentChunk.trim());
        }
    }

    return chunks;
}

/**
 * Splits text brutally at word boundaries, trying to stay under maxLen
 */
function splitBrutally(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    const words = text.split(/\s+/);
    let current = '';

    for (const word of words) {
        if (current.length + word.length + 1 > maxLen) {
            if (current) chunks.push(current);
            current = word;
        } else {
            current += (current ? ' ' : '') + word;
        }
    }

    if (current) chunks.push(current);
    return chunks;
}

// -----------------------------------------------------------------------------
// Main: Ingest Article
// -----------------------------------------------------------------------------
/**
 * Ingests an article: chunks its content, generates embeddings, stores in DB.
 */
export async function ingestArticle(articleId: string): Promise<void> {
    logger.info(`Starting ingestion`, { module: 'RAG', articleId });

    // 1. Fetch article
    const article = await prisma.article.findUnique({
        where: { id: articleId },
        select: {
            id: true,
            title: true,
            content: true,
            isIndexed: true,
        },
    });

    if (!article) {
        logger.error(`Article not found`, { module: 'RAG', articleId });
        return;
    }

    if (!article.content || article.content.trim().length === 0) {
        logger.warn(`Article has no content, skipping`, { module: 'RAG', articleId });
        return;
    }

    // 2. Delete existing chunks (for re-indexing)
    const deletedCount = await prisma.knowledgeChunk.deleteMany({
        where: { articleId },
    });
    if (deletedCount.count > 0) {
        logger.debug(`Deleted existing chunks`, { module: 'RAG', count: deletedCount.count });
    }

    // 3. Chunk the content
    // Include title as first chunk for better context
    const fullText = `${article.title}\n\n${article.content}`;
    const textChunks = chunkText(fullText);

    if (textChunks.length === 0) {
        logger.warn(`[RAG] No valid chunks generated, skipping article ${articleId}`);
        return;
    }

    logger.info(`[RAG] Generated ${textChunks.length} chunks`);

    // 4. Generate embeddings (batch)
    const embeddings = await generateEmbeddings(textChunks);

    if (embeddings.length !== textChunks.length) {
        logger.error(`[RAG] Embedding count mismatch!`, { articleId });
        return;
    }

    // 5. Store chunks with embeddings (using raw SQL for vector type)
    logger.debug(`[RAG] 💾 Storing chunks in database...`);

    for (let i = 0; i < textChunks.length; i++) {
        const content = textChunks[i];
        const embedding = embeddings[i];
        const embeddingStr = `[${embedding.join(',')}]`;

        // Use raw SQL to handle vector type properly
        await prisma.$executeRaw`
      INSERT INTO "KnowledgeChunk" ("id", "content", "embedding", "articleId")
      VALUES (
        gen_random_uuid()::text,
        ${content},
        ${embeddingStr}::vector,
        ${articleId}
      )
    `;
    }

    // 6. Mark article as indexed
    await prisma.article.update({
        where: { id: articleId },
        data: { isIndexed: true },
    });

    logger.info(`[RAG] Article indexed successfully: ${article.title}`);
}

// -----------------------------------------------------------------------------
// Helper: Generate Embeddings
// -----------------------------------------------------------------------------
/**
 * Generates embeddings for multiple text chunks using OpenAI API.
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    logger.debug(`[RAG] Generating embeddings for ${texts.length} chunks...`);

    try {
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: texts,
            user: 'epion-rag-ingestion',
        });

        // Extract embeddings in order
        const embeddings = response.data
            .sort((a, b) => a.index - b.index)
            .map(item => item.embedding);

        logger.debug(`Embeddings generated`, { module: 'RAG', dimensions: embeddings[0].length });
        return embeddings;
    } catch (error: any) {
        logger.error(`Embedding API error`, { module: 'RAG', error: error.message });
        throw error;
    }
}

// -----------------------------------------------------------------------------
// Bulk Ingestion
// -----------------------------------------------------------------------------
/**
 * Ingests all articles that haven't been indexed yet.
 */
export async function ingestAllPendingArticles(): Promise<void> {
    const pending = await prisma.article.findMany({
        where: {
            isIndexed: false,
            content: { not: null },
        },
        select: { id: true, title: true },
    });

    logger.info(`Found pending articles to ingest`, { module: 'RAG', count: pending.length });

    for (const article of pending) {
        try {
            await ingestArticle(article.id);
        } catch (error: any) {
            logger.error(`Failed to ingest article`, { module: 'RAG', title: article.title, error: error.message });
        }
    }

    logger.info(`[RAG] Bulk ingestion complete`, { count: pending.length });
}

// -----------------------------------------------------------------------------
// Search: Find Similar Chunks (RAG Query)
// -----------------------------------------------------------------------------

export type SearchResult = {
    content: string;
    articleTitle: string;
    articleSlug: string;
    similarity: number;
};

export type InternalSearchSource = {
    title: string;
    url: string;
    domain: string;
    content: string;
    score: number;
    articleSlug: string;
    provider: 'rag';
};

type ArticleSourceMetadata = {
    slug: string;
    title: string;
    sourceUrl: string | null;
};

function normalizeDomainFromUrl(inputUrl: string | null | undefined): string {
    if (!inputUrl) {
        return 'epion.io';
    }

    try {
        return new URL(inputUrl).hostname.replace(/^www\./, '');
    } catch {
        return 'epion.io';
    }
}

function readFirstSourceUrl(factCheckData: Prisma.JsonValue | null | undefined): string | null {
    if (!factCheckData || typeof factCheckData !== 'object' || Array.isArray(factCheckData)) {
        return null;
    }

    const sources = (factCheckData as Record<string, unknown>).sources;
    if (!Array.isArray(sources) || sources.length === 0) {
        return null;
    }

    for (const source of sources) {
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            continue;
        }

        const url = (source as Record<string, unknown>).url;
        if (typeof url === 'string' && url.trim()) {
            return url.trim();
        }
    }

    return null;
}

function readGenerationSourceUrl(generationConfig: Prisma.JsonValue | null | undefined): string | null {
    if (!generationConfig || typeof generationConfig !== 'object' || Array.isArray(generationConfig)) {
        return null;
    }

    const sourceUrl = (generationConfig as Record<string, unknown>).sourceUrl;
    if (typeof sourceUrl === 'string' && sourceUrl.trim()) {
        return sourceUrl.trim();
    }

    return null;
}

async function loadArticleSourceMetadata(articleSlugs: string[]): Promise<Map<string, ArticleSourceMetadata>> {
    if (articleSlugs.length === 0) {
        return new Map();
    }

    const articles = await prisma.article.findMany({
        where: {
            slug: { in: articleSlugs },
            status: 'PUBLISHED',
        },
        select: {
            slug: true,
            title: true,
            generationConfig: true,
            factCheckData: true,
        },
    });

    const metadataBySlug = new Map<string, ArticleSourceMetadata>();

    for (const article of articles) {
        const sourceUrl =
            readFirstSourceUrl(article.factCheckData) ||
            readGenerationSourceUrl(article.generationConfig) ||
            null;

        metadataBySlug.set(article.slug, {
            slug: article.slug,
            title: article.title,
            sourceUrl,
        });
    }

    return metadataBySlug;
}

/**
 * Searches for knowledge chunks similar to the user's query.
 * Uses cosine similarity on vector embeddings.
 * 
 * @param query - The user's question/search query
 * @param limit - Maximum number of chunks to return (default: 5)
 * @returns Array of relevant text chunks with metadata
 */
export async function searchSimilarChunks(query: string, limit: number = 5): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
        return [];
    }

    logger.debug(`[RAG] Searching for: "${query.substring(0, 50)}..."`);

    try {
        // 1. Generate embedding for the query
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: query,
            user: 'epion-rag-search',
        });

        const queryEmbedding = response.data[0].embedding;
        const embeddingStr = `[${queryEmbedding.join(',')}]`;

        // 2. Search for similar chunks using cosine similarity
        // JOIN with Article table to get title and slug
        const results = await prisma.$queryRaw<SearchResult[]>`
            SELECT 
                kc.content,
                a.title as "articleTitle",
                a.slug as "articleSlug",
                1 - (kc.embedding <=> ${embeddingStr}::vector) as similarity
            FROM "KnowledgeChunk" kc
            JOIN "Article" a ON kc."articleId" = a.id
            WHERE kc.embedding IS NOT NULL
              AND a.status = 'PUBLISHED'
              AND 1 - (kc.embedding <=> ${embeddingStr}::vector) >= ${SIMILARITY_THRESHOLD}
            ORDER BY kc.embedding <=> ${embeddingStr}::vector
            LIMIT ${limit}
        `;

        if (results.length === 0) {
            logger.info(`[RAG] Search returned no chunk above similarity threshold`, {
                module: 'RAG',
                query: query.substring(0, 80),
                similarityThreshold: SIMILARITY_THRESHOLD,
            });
            return [];
        }

        logger.info(`[RAG] Search complete`, {
            module: 'RAG',
            query: query.substring(0, 50),
            results: results.length,
            similarityThreshold: SIMILARITY_THRESHOLD,
            topSimilarity: results[0]?.similarity ?? null,
        });

        return results;
    } catch (error: any) {
        logger.error(`Search error`, { module: 'RAG', error: error.message });
        return [];
    }
}

export async function searchInternalSources(query: string, limit: number = 5): Promise<InternalSearchSource[]> {
    const chunkResults = await searchSimilarChunks(query, Math.max(limit * 2, limit));
    const articleSourceMetadata = await loadArticleSourceMetadata(
        [...new Set(chunkResults.map((result) => result.articleSlug).filter(Boolean))],
    );
    const dedupedSources = new Map<string, InternalSearchSource>();

    for (const result of chunkResults) {
        if (!result.articleSlug || dedupedSources.has(result.articleSlug)) {
            continue;
        }

        const articleMetadata = articleSourceMetadata.get(result.articleSlug);
        const preferredUrl = articleMetadata?.sourceUrl || `/article/${result.articleSlug}`;
        const preferredDomain = normalizeDomainFromUrl(articleMetadata?.sourceUrl);

        dedupedSources.set(result.articleSlug, {
            title: articleMetadata?.title || result.articleTitle,
            url: preferredUrl,
            domain: preferredDomain,
            content: result.content,
            score: result.similarity,
            articleSlug: result.articleSlug,
            provider: 'rag',
        });

        if (dedupedSources.size >= limit) {
            break;
        }
    }

    return Array.from(dedupedSources.values());
}
