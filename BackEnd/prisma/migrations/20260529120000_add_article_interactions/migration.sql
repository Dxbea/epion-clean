-- CreateEnum
CREATE TYPE "public"."ArticleContributionType" AS ENUM ('SOURCE', 'NUANCE', 'CONTRADICTION', 'QUESTION', 'CORRECTION');

-- CreateEnum
CREATE TYPE "public"."ArticleContributionValidationType" AS ENUM ('WELL_SOURCED', 'ADDS_NUANCE', 'NEEDS_CHECK');

-- CreateTable
CREATE TABLE "public"."ArticleOpinionQuestion" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "thesisA" TEXT NOT NULL,
    "thesisB" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleOpinionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ArticleOpinionPosition" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selectedPosition" DOUBLE PRECISION,
    "lacksContext" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleOpinionPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ArticleContribution" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."ArticleContributionType" NOT NULL,
    "text" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ArticleContributionValidation" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."ArticleContributionValidationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleContributionValidation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArticleOpinionQuestion_articleId_key" ON "public"."ArticleOpinionQuestion"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleOpinionPosition_articleId_userId_key" ON "public"."ArticleOpinionPosition"("articleId", "userId");

-- CreateIndex
CREATE INDEX "ArticleOpinionPosition_userId_idx" ON "public"."ArticleOpinionPosition"("userId");

-- CreateIndex
CREATE INDEX "ArticleContribution_articleId_createdAt_idx" ON "public"."ArticleContribution"("articleId", "createdAt");

-- CreateIndex
CREATE INDEX "ArticleContribution_userId_idx" ON "public"."ArticleContribution"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleContributionValidation_contributionId_userId_type_key" ON "public"."ArticleContributionValidation"("contributionId", "userId", "type");

-- CreateIndex
CREATE INDEX "ArticleContributionValidation_userId_idx" ON "public"."ArticleContributionValidation"("userId");

-- AddForeignKey
ALTER TABLE "public"."ArticleOpinionQuestion" ADD CONSTRAINT "ArticleOpinionQuestion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "public"."Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArticleOpinionPosition" ADD CONSTRAINT "ArticleOpinionPosition_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "public"."Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArticleOpinionPosition" ADD CONSTRAINT "ArticleOpinionPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArticleContribution" ADD CONSTRAINT "ArticleContribution_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "public"."Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArticleContribution" ADD CONSTRAINT "ArticleContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArticleContributionValidation" ADD CONSTRAINT "ArticleContributionValidation_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "public"."ArticleContribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArticleContributionValidation" ADD CONSTRAINT "ArticleContributionValidation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
