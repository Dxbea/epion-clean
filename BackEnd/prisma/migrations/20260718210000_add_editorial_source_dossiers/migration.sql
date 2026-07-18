CREATE TYPE "EditorialDossierStatus" AS ENUM (
    'PENDING', 'RUNNING', 'EVIDENCE_READY', 'COMPLETED', 'BLOCKED', 'FAILED'
);
CREATE TYPE "EditorialEvidenceRole" AS ENUM ('PRIMARY', 'CONTEXT');

CREATE TABLE "EditorialSourceDossier" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "dossierVersion" TEXT NOT NULL,
    "status" "EditorialDossierStatus" NOT NULL DEFAULT 'PENDING',
    "shadowOnly" BOOLEAN NOT NULL DEFAULT true,
    "generatorModel" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "selectionRank" INTEGER NOT NULL,
    "minimumDomains" INTEGER NOT NULL,
    "maxDocuments" INTEGER NOT NULL,
    "maxChunksPerDocument" INTEGER NOT NULL,
    "configuration" JSONB,
    "candidateSnapshot" JSONB,
    "sourceDomains" JSONB,
    "evidenceHash" TEXT,
    "evidenceFrozenAt" TIMESTAMP(3),
    "selectedDocumentCount" INTEGER NOT NULL DEFAULT 0,
    "selectedDomainCount" INTEGER NOT NULL DEFAULT 0,
    "selectedChunkCount" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "error" TEXT,
    "metrics" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorialSourceDossier_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialSourceDossier_shadow_only_check" CHECK ("shadowOnly" = true),
    CONSTRAINT "EditorialSourceDossier_selection_rank_check" CHECK ("selectionRank" >= 1),
    CONSTRAINT "EditorialSourceDossier_limits_check" CHECK (
        "minimumDomains" >= 1 AND
        "maxDocuments" >= "minimumDomains" AND
        "maxChunksPerDocument" >= 1
    ),
    CONSTRAINT "EditorialSourceDossier_counts_check" CHECK (
        "selectedDocumentCount" >= 0 AND
        "selectedDomainCount" >= 0 AND
        "selectedChunkCount" >= 0
    )
);

CREATE TABLE "EditorialBriefEvidence" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "evidenceKey" TEXT NOT NULL,
    "role" "EditorialEvidenceRole" NOT NULL,
    "position" INTEGER NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "documentTitle" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "chunkPosition" INTEGER NOT NULL,
    "contentSnapshot" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialBriefEvidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialBriefEvidence_position_check" CHECK ("position" >= 0),
    CONSTRAINT "EditorialBriefEvidence_similarity_check" CHECK (
        "similarity" >= -1 AND "similarity" <= 1
    )
);

CREATE TABLE "EditorialBrief" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "promptVersion" TEXT NOT NULL,
    "generatorModel" TEXT NOT NULL,
    "structuredContent" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostMicros" INTEGER,
    "shadowOnly" BOOLEAN NOT NULL DEFAULT true,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorialBrief_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialBrief_shadow_only_check" CHECK ("shadowOnly" = true),
    CONSTRAINT "EditorialBrief_schema_version_check" CHECK ("schemaVersion" >= 1),
    CONSTRAINT "EditorialBrief_usage_check" CHECK (
        ("inputTokens" IS NULL OR "inputTokens" >= 0) AND
        ("outputTokens" IS NULL OR "outputTokens" >= 0) AND
        ("estimatedCostMicros" IS NULL OR "estimatedCostMicros" >= 0)
    )
);

CREATE UNIQUE INDEX "EditorialSourceDossier_idempotencyKey_key"
    ON "EditorialSourceDossier"("idempotencyKey");
CREATE INDEX "EditorialSourceDossier_candidateId_createdAt_idx"
    ON "EditorialSourceDossier"("candidateId", "createdAt");
CREATE INDEX "EditorialSourceDossier_status_createdAt_idx"
    ON "EditorialSourceDossier"("status", "createdAt");
CREATE UNIQUE INDEX "EditorialBriefEvidence_dossierId_chunkId_key"
    ON "EditorialBriefEvidence"("dossierId", "chunkId");
CREATE UNIQUE INDEX "EditorialBriefEvidence_dossierId_evidenceKey_key"
    ON "EditorialBriefEvidence"("dossierId", "evidenceKey");
CREATE INDEX "EditorialBriefEvidence_documentId_idx" ON "EditorialBriefEvidence"("documentId");
CREATE INDEX "EditorialBriefEvidence_chunkId_idx" ON "EditorialBriefEvidence"("chunkId");
CREATE INDEX "EditorialBriefEvidence_dossierId_role_position_idx"
    ON "EditorialBriefEvidence"("dossierId", "role", "position");
CREATE UNIQUE INDEX "EditorialBrief_dossierId_key" ON "EditorialBrief"("dossierId");
CREATE INDEX "EditorialBrief_contentHash_idx" ON "EditorialBrief"("contentHash");
CREATE INDEX "EditorialBrief_generatedAt_idx" ON "EditorialBrief"("generatedAt");

ALTER TABLE "EditorialSourceDossier"
    ADD CONSTRAINT "EditorialSourceDossier_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "EditorialCandidate"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EditorialBriefEvidence"
    ADD CONSTRAINT "EditorialBriefEvidence_dossierId_fkey"
    FOREIGN KEY ("dossierId") REFERENCES "EditorialSourceDossier"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EditorialBriefEvidence"
    ADD CONSTRAINT "EditorialBriefEvidence_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "IngestedDocument"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EditorialBriefEvidence"
    ADD CONSTRAINT "EditorialBriefEvidence_chunkId_fkey"
    FOREIGN KEY ("chunkId") REFERENCES "DocumentChunk"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EditorialBrief"
    ADD CONSTRAINT "EditorialBrief_dossierId_fkey"
    FOREIGN KEY ("dossierId") REFERENCES "EditorialSourceDossier"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
