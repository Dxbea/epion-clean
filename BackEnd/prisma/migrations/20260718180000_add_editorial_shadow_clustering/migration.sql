CREATE TYPE "EditorialRunMode" AS ENUM ('SHADOW');
CREATE TYPE "EditorialRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "EditorialCandidateStatus" AS ENUM ('SHADOW_PROPOSED', 'SHADOW_SUPPRESSED');
CREATE TYPE "EditorialRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "EditorialTopicDocumentRole" AS ENUM ('REPRESENTATIVE', 'EVIDENCE', 'QUASI_DUPLICATE');

CREATE TABLE "EditorialRun" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "mode" "EditorialRunMode" NOT NULL DEFAULT 'SHADOW',
    "status" "EditorialRunStatus" NOT NULL DEFAULT 'PENDING',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "configuration" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "metrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorialRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialRun_shadow_mode_check" CHECK ("mode" = 'SHADOW'),
    CONSTRAINT "EditorialRun_window_check" CHECK ("windowStart" < "windowEnd")
);

CREATE TABLE "EditorialTopic" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "clusterKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "language" TEXT,
    "dominantCategoryId" TEXT,
    "dominantSourceId" TEXT,
    "representativeDocumentId" TEXT NOT NULL,
    "centroidEmbedding" vector(1536),
    "centroidModel" TEXT NOT NULL,
    "documentCount" INTEGER NOT NULL,
    "independentDomainCount" INTEGER NOT NULL,
    "firstEventAt" TIMESTAMP(3) NOT NULL,
    "latestEventAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorialTopic_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialTopic_document_count_check" CHECK ("documentCount" >= 1),
    CONSTRAINT "EditorialTopic_domain_count_check" CHECK ("independentDomainCount" >= 1),
    CONSTRAINT "EditorialTopic_event_window_check" CHECK ("firstEventAt" <= "latestEventAt")
);

CREATE TABLE "EditorialTopicDocument" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "role" "EditorialTopicDocumentRole" NOT NULL,
    "similarityToCentroid" DOUBLE PRECISION NOT NULL,
    "quasiDuplicateOfDocumentId" TEXT,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialTopicDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialTopicDocument_similarity_check"
        CHECK ("similarityToCentroid" >= 0 AND "similarityToCentroid" <= 1)
);

CREATE TABLE "EditorialCandidate" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "status" "EditorialCandidateStatus" NOT NULL,
    "editorialScore" DOUBLE PRECISION NOT NULL,
    "freshnessScore" DOUBLE PRECISION NOT NULL,
    "sourceDiversityScore" DOUBLE PRECISION NOT NULL,
    "independentDomainScore" DOUBLE PRECISION NOT NULL,
    "coverageScore" DOUBLE PRECISION NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "riskLevel" "EditorialRiskLevel" NOT NULL,
    "shadowOnly" BOOLEAN NOT NULL DEFAULT true,
    "rationale" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorialCandidate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialCandidate_shadow_only_check" CHECK ("shadowOnly" = true),
    CONSTRAINT "EditorialCandidate_scores_check" CHECK (
        "editorialScore" BETWEEN 0 AND 100 AND
        "freshnessScore" BETWEEN 0 AND 100 AND
        "sourceDiversityScore" BETWEEN 0 AND 100 AND
        "independentDomainScore" BETWEEN 0 AND 100 AND
        "coverageScore" BETWEEN 0 AND 100 AND
        "relevanceScore" BETWEEN 0 AND 100 AND
        "riskScore" BETWEEN 0 AND 100
    )
);

CREATE UNIQUE INDEX "EditorialRun_idempotencyKey_key" ON "EditorialRun"("idempotencyKey");
CREATE INDEX "EditorialRun_status_createdAt_idx" ON "EditorialRun"("status", "createdAt");
CREATE INDEX "EditorialRun_windowStart_windowEnd_idx" ON "EditorialRun"("windowStart", "windowEnd");
CREATE UNIQUE INDEX "EditorialTopic_runId_clusterKey_key" ON "EditorialTopic"("runId", "clusterKey");
CREATE INDEX "EditorialTopic_runId_latestEventAt_idx" ON "EditorialTopic"("runId", "latestEventAt");
CREATE INDEX "EditorialTopic_representativeDocumentId_idx" ON "EditorialTopic"("representativeDocumentId");
CREATE INDEX "EditorialTopic_dominantCategoryId_latestEventAt_idx" ON "EditorialTopic"("dominantCategoryId", "latestEventAt");
CREATE UNIQUE INDEX "EditorialTopicDocument_topicId_documentId_key" ON "EditorialTopicDocument"("topicId", "documentId");
CREATE INDEX "EditorialTopicDocument_documentId_idx" ON "EditorialTopicDocument"("documentId");
CREATE INDEX "EditorialTopicDocument_quasiDuplicateOfDocumentId_idx" ON "EditorialTopicDocument"("quasiDuplicateOfDocumentId");
CREATE INDEX "EditorialTopicDocument_topicId_role_idx" ON "EditorialTopicDocument"("topicId", "role");
CREATE UNIQUE INDEX "EditorialCandidate_topicId_key" ON "EditorialCandidate"("topicId");
CREATE INDEX "EditorialCandidate_status_editorialScore_idx" ON "EditorialCandidate"("status", "editorialScore");
CREATE INDEX "EditorialCandidate_riskLevel_editorialScore_idx" ON "EditorialCandidate"("riskLevel", "editorialScore");

ALTER TABLE "EditorialTopic"
    ADD CONSTRAINT "EditorialTopic_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "EditorialRun"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EditorialTopic"
    ADD CONSTRAINT "EditorialTopic_representativeDocumentId_fkey"
    FOREIGN KEY ("representativeDocumentId") REFERENCES "IngestedDocument"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EditorialTopicDocument"
    ADD CONSTRAINT "EditorialTopicDocument_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "EditorialTopic"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EditorialTopicDocument"
    ADD CONSTRAINT "EditorialTopicDocument_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "IngestedDocument"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EditorialTopicDocument"
    ADD CONSTRAINT "EditorialTopicDocument_quasiDuplicateOfDocumentId_fkey"
    FOREIGN KEY ("quasiDuplicateOfDocumentId") REFERENCES "IngestedDocument"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EditorialCandidate"
    ADD CONSTRAINT "EditorialCandidate_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "EditorialTopic"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
