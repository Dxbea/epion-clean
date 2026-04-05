-- Activer pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "NewsCache" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsCache_pkey" PRIMARY KEY ("id")
);

-- Colonnes supplémentaires requises par l'utilisateur (Vecteurs et MinHash)
ALTER TABLE "NewsCache" ADD COLUMN "embedding" vector(1536);
ALTER TABLE "NewsCache" ADD COLUMN "minhash" text;

-- CreateIndex
CREATE UNIQUE INDEX "NewsCache_url_key" ON "NewsCache"("url");

-- Create HNSW Index (ultra-rapide)
CREATE INDEX "NewsCache_embedding_idx" ON "NewsCache" USING hnsw ("embedding" vector_cosine_ops);
