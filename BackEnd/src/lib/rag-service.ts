/**
 * RAG Service - Epion Energy
 * Handles article ingestion: chunking, embedding, and vector storage
 */

import OpenAI from 'openai';
import { prisma } from './db';
import { Prisma } from '@prisma/client';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_CHUNK_SIZE = 1000;
const MIN_CHUNK_SIZE = 50;

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
    console.log(`[RAG] 🚀 Starting ingestion for article: ${articleId}`);

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
        console.log(`[RAG] ❌ Article not found: ${articleId}`);
        return;
    }

    if (!article.content || article.content.trim().length === 0) {
        console.log(`[RAG] ⚠️ Article has no content, skipping: ${articleId}`);
        return;
    }

    // 2. Delete existing chunks (for re-indexing)
    const deletedCount = await prisma.knowledgeChunk.deleteMany({
        where: { articleId },
    });
    if (deletedCount.count > 0) {
        console.log(`[RAG] 🧹 Deleted ${deletedCount.count} existing chunks`);
    }

    // 3. Chunk the content
    // Include title as first chunk for better context
    const fullText = `${article.title}\n\n${article.content}`;
    const textChunks = chunkText(fullText);

    if (textChunks.length === 0) {
        console.log(`[RAG] ⚠️ No valid chunks generated, skipping`);
        return;
    }

    console.log(`[RAG] 📦 Generated ${textChunks.length} chunks`);

    // 4. Generate embeddings (batch)
    const embeddings = await generateEmbeddings(textChunks);

    if (embeddings.length !== textChunks.length) {
        console.log(`[RAG] ❌ Embedding count mismatch!`);
        return;
    }

    // 5. Store chunks with embeddings (using raw SQL for vector type)
    console.log(`[RAG] 💾 Storing chunks in database...`);

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

    console.log(`[RAG] ✅ Article indexed successfully: ${article.title}`);
}

// -----------------------------------------------------------------------------
// Helper: Generate Embeddings
// -----------------------------------------------------------------------------
/**
 * Generates embeddings for multiple text chunks using OpenAI API.
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    console.log(`[RAG] 🧠 Generating embeddings for ${texts.length} chunks...`);

    try {
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: texts,
        });

        // Extract embeddings in order
        const embeddings = response.data
            .sort((a, b) => a.index - b.index)
            .map(item => item.embedding);

        console.log(`[RAG] ✅ Embeddings generated (${embeddings[0].length} dimensions)`);
        return embeddings;
    } catch (error: any) {
        console.error(`[RAG] ❌ Embedding API error:`, error.message);
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

    console.log(`[RAG] 📚 Found ${pending.length} articles to ingest`);

    for (const article of pending) {
        try {
            await ingestArticle(article.id);
        } catch (error: any) {
            console.error(`[RAG] ❌ Failed to ingest "${article.title}":`, error.message);
        }
    }

    console.log(`[RAG] 🎉 Bulk ingestion complete`);
}
