CREATE TYPE "EditorialVerificationStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'PASSED',
  'HUMAN_REVIEW_REQUIRED',
  'FAILED'
);

CREATE TABLE "EditorialVerificationRun" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "status" "EditorialVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "verificationVersion" TEXT NOT NULL,
  "corpusAssessment" JSONB,
  "serperRequired" BOOLEAN NOT NULL DEFAULT false,
  "serperReasons" JSONB,
  "serperQueries" JSONB,
  "serperDocumentIds" JSONB,
  "mistralModel" TEXT NOT NULL,
  "mistralPromptVersion" TEXT NOT NULL,
  "mistralAudit" JSONB,
  "gateReasons" JSONB,
  "sourceSnapshot" JSONB,
  "factCheckScore" INTEGER,
  "factCheckContentHash" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseExpiresAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EditorialVerificationRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EditorialVerificationRun_idempotencyKey_key"
  ON "EditorialVerificationRun"("idempotencyKey");
CREATE INDEX "EditorialVerificationRun_draftId_createdAt_idx"
  ON "EditorialVerificationRun"("draftId", "createdAt");
CREATE INDEX "EditorialVerificationRun_revisionId_status_idx"
  ON "EditorialVerificationRun"("revisionId", "status");
CREATE INDEX "EditorialVerificationRun_articleId_status_idx"
  ON "EditorialVerificationRun"("articleId", "status");
CREATE INDEX "EditorialVerificationRun_status_createdAt_idx"
  ON "EditorialVerificationRun"("status", "createdAt");

ALTER TABLE "EditorialVerificationRun"
  ADD CONSTRAINT "EditorialVerificationRun_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "EditorialDraft"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialVerificationRun"
  ADD CONSTRAINT "EditorialVerificationRun_revisionId_fkey"
  FOREIGN KEY ("revisionId") REFERENCES "EditorialDraftRevision"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialVerificationRun"
  ADD CONSTRAINT "EditorialVerificationRun_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "Article"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
