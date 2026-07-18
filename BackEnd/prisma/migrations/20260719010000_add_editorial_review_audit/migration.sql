CREATE TYPE "EditorialReviewAuditAction" AS ENUM (
    'APPROVED', 'REJECTED', 'APPROVAL_BLOCKED'
);

ALTER TABLE "EditorialQualityGate" ADD COLUMN "evaluatedContentHash" TEXT;
UPDATE "EditorialQualityGate" gate
SET "evaluatedContentHash" = draft."contentHash"
FROM "EditorialDraft" draft
WHERE draft.id = gate."draftId";
ALTER TABLE "EditorialQualityGate" ALTER COLUMN "evaluatedContentHash" SET NOT NULL;

CREATE TABLE "EditorialReviewAuditLog" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "EditorialReviewAuditAction" NOT NULL,
    "contentHash" TEXT NOT NULL,
    "previousStatus" "EditorialDraftStatus" NOT NULL,
    "resultingStatus" "EditorialDraftStatus" NOT NULL,
    "articleId" TEXT,
    "reviewNote" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialReviewAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EditorialReviewAuditLog_draftId_createdAt_idx"
    ON "EditorialReviewAuditLog"("draftId", "createdAt");
CREATE INDEX "EditorialReviewAuditLog_actorUserId_createdAt_idx"
    ON "EditorialReviewAuditLog"("actorUserId", "createdAt");
CREATE INDEX "EditorialReviewAuditLog_action_createdAt_idx"
    ON "EditorialReviewAuditLog"("action", "createdAt");
CREATE INDEX "EditorialReviewAuditLog_articleId_idx"
    ON "EditorialReviewAuditLog"("articleId");

ALTER TABLE "EditorialReviewAuditLog" ADD CONSTRAINT "EditorialReviewAuditLog_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "EditorialDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialReviewAuditLog" ADD CONSTRAINT "EditorialReviewAuditLog_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialReviewAuditLog" ADD CONSTRAINT "EditorialReviewAuditLog_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
