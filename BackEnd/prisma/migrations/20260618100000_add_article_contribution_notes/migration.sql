-- Add production-ready contribution lifecycle, reports, and community notes.
CREATE TYPE "public"."ArticleContributionStatus" AS ENUM ('ACTIVE', 'DELETED', 'HIDDEN', 'STALE');
CREATE TYPE "public"."ArticleContributionReportReason" AS ENUM ('SPAM', 'ABUSE', 'OFF_TOPIC', 'MISLEADING_SOURCE', 'PERSONAL_DATA', 'OTHER');
CREATE TYPE "public"."ArticleContributionReportStatus" AS ENUM ('PENDING', 'DISMISSED', 'REVIEWED', 'ACTIONED');

ALTER TABLE "ArticleContribution"
ADD COLUMN "targetContributionId" TEXT,
ADD COLUMN "status" "public"."ArticleContributionStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "editCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "ArticleContribution_targetContributionId_bridgingScore_createdAt_idx"
ON "ArticleContribution"("targetContributionId", "bridgingScore" DESC, "createdAt" DESC);

CREATE INDEX "ArticleContribution_articleId_status_createdAt_idx"
ON "ArticleContribution"("articleId", "status", "createdAt");

ALTER TABLE "ArticleContribution"
ADD CONSTRAINT "ArticleContribution_targetContributionId_fkey"
FOREIGN KEY ("targetContributionId")
REFERENCES "ArticleContribution"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

CREATE TABLE "ArticleContributionReport" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "public"."ArticleContributionReportReason" NOT NULL,
    "details" TEXT,
    "status" "public"."ArticleContributionReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "ArticleContributionReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArticleContributionReport_contributionId_reporterId_reason_key"
ON "ArticleContributionReport"("contributionId", "reporterId", "reason");

CREATE INDEX "ArticleContributionReport_status_createdAt_idx"
ON "ArticleContributionReport"("status", "createdAt");

CREATE INDEX "ArticleContributionReport_reporterId_idx"
ON "ArticleContributionReport"("reporterId");

CREATE INDEX "ArticleContributionReport_reviewedById_idx"
ON "ArticleContributionReport"("reviewedById");

ALTER TABLE "ArticleContributionReport"
ADD CONSTRAINT "ArticleContributionReport_contributionId_fkey"
FOREIGN KEY ("contributionId")
REFERENCES "ArticleContribution"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "ArticleContributionReport"
ADD CONSTRAINT "ArticleContributionReport_reporterId_fkey"
FOREIGN KEY ("reporterId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "ArticleContributionReport"
ADD CONSTRAINT "ArticleContributionReport_reviewedById_fkey"
FOREIGN KEY ("reviewedById")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
