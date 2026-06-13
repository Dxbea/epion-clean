-- AlterTable
ALTER TABLE "ArticleContribution" ADD COLUMN "needsRecalc" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ArticleContribution" ADD COLUMN "bridgingScore" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ArticleContribution_articleId_bridgingScore_createdAt_idx" ON "ArticleContribution"("articleId", "bridgingScore" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ArticleContribution_needsRecalc_idx" ON "ArticleContribution"("needsRecalc");
