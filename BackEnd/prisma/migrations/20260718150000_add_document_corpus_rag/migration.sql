ALTER TYPE "IngestedDocumentStatus" ADD VALUE 'EXTRACTED';
ALTER TYPE "IngestedDocumentStatus" ADD VALUE 'INDEXED';

ALTER TABLE "IngestedDocument"
    ADD COLUMN "duplicateOfId" TEXT,
    ADD COLUMN "lastFetchAttemptAt" TIMESTAMP(3),
    ADD COLUMN "fetchAttempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "fetchError" TEXT,
    ADD COLUMN "indexedAt" TIMESTAMP(3),
    ADD COLUMN "embeddingModel" TEXT,
    ADD COLUMN "chunkingVersion" INTEGER,
    ADD COLUMN "embeddingTokenCount" INTEGER;

CREATE TABLE "DocumentContentIdentity" (
    "contentHash" TEXT NOT NULL,
    "canonicalDocumentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentContentIdentity_pkey" PRIMARY KEY ("contentHash")
);

CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "estimatedTokens" INTEGER NOT NULL,
    "embedding" vector(1536),
    "embeddingModel" TEXT NOT NULL,
    "chunkingVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IngestedDocument_duplicateOfId_idx" ON "IngestedDocument"("duplicateOfId");
CREATE INDEX "DocumentContentIdentity_canonicalDocumentId_idx"
    ON "DocumentContentIdentity"("canonicalDocumentId");
CREATE UNIQUE INDEX "DocumentChunk_documentId_position_key"
    ON "DocumentChunk"("documentId", "position");
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");
CREATE INDEX "DocumentChunk_contentHash_idx" ON "DocumentChunk"("contentHash");

ALTER TABLE "IngestedDocument"
    ADD CONSTRAINT "IngestedDocument_duplicateOfId_fkey"
    FOREIGN KEY ("duplicateOfId") REFERENCES "IngestedDocument"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentContentIdentity"
    ADD CONSTRAINT "DocumentContentIdentity_canonicalDocumentId_fkey"
    FOREIGN KEY ("canonicalDocumentId") REFERENCES "IngestedDocument"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentChunk"
    ADD CONSTRAINT "DocumentChunk_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "IngestedDocument"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
