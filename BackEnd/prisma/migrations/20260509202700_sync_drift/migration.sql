CREATE EXTENSION IF NOT EXISTS vector;
-- CreateEnum
CREATE TYPE "FactCheckStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'STALE');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('FREE', 'READER', 'PREMIUM');

-- CreateEnum
CREATE TYPE "PoliticalBias" AS ENUM ('EXTREME_LEFT', 'LEFT', 'CENTER_LEFT', 'CENTER', 'CENTER_RIGHT', 'RIGHT', 'EXTREME_RIGHT', 'SATIRE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Reliability" AS ENUM ('HIGH', 'MIXED', 'LOW', 'PROPAGANDA', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('AGENCY', 'MEDIA', 'ACADEMIC', 'GOVERNMENT', 'BLOG', 'SOCIAL', 'COMMERCIAL', 'GENERAL');

-- CreateEnum
CREATE TYPE "SourceBias" AS ENUM ('FAR_LEFT', 'LEFT', 'CENTER_LEFT', 'CENTER', 'CENTER_RIGHT', 'RIGHT', 'FAR_RIGHT', 'SATIRE', 'UNKNOWN');

-- AlterEnum
ALTER TYPE "ReactionType" ADD VALUE 'DISLIKE';

-- DropIndex
DROP INDEX "NewsCache_embedding_idx";

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "factCheckCompletedAt" TIMESTAMP(3),
ADD COLUMN     "factCheckContentHash" TEXT,
ADD COLUMN     "factCheckError" TEXT,
ADD COLUMN     "factCheckStartedAt" TIMESTAMP(3),
ADD COLUMN     "factCheckStatus" "FactCheckStatus",
ADD COLUMN     "isIndexed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ArticleReaction" DROP CONSTRAINT "ArticleReaction_pkey",
ADD CONSTRAINT "ArticleReaction_pkey" PRIMARY KEY ("userId", "articleId");

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "sources" JSONB;

-- AlterTable
ALTER TABLE "NewsCache" DROP COLUMN "embedding",
DROP COLUMN "minhash";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "followersCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "followingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inviteCodeId" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserUsage" (
    "userId" TEXT NOT NULL,
    "dailyCredits" INTEGER NOT NULL DEFAULT 700,
    "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "articlesCreated" INTEGER NOT NULL DEFAULT 0,
    "articleQuotaResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plan" "PlanType" NOT NULL DEFAULT 'FREE',

    CONSTRAINT "UserUsage_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "IpUsage" (
    "ipAddress" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpUsage_pkey" PRIMARY KEY ("ipAddress")
);

-- CreateTable
CREATE TABLE "Repost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("followerId","followingId")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trustScore" INTEGER NOT NULL DEFAULT 50,
    "transparencyScore" INTEGER NOT NULL DEFAULT 0,
    "isAdsTxtValid" BOOLEAN NOT NULL DEFAULT false,
    "isOwnerPublic" BOOLEAN NOT NULL DEFAULT false,
    "editorialScore" INTEGER NOT NULL DEFAULT 0,
    "hasFactCheckFailures" BOOLEAN NOT NULL DEFAULT false,
    "factCheckFailCount" INTEGER NOT NULL DEFAULT 0,
    "hasCorrectionPolicy" BOOLEAN NOT NULL DEFAULT false,
    "semanticScore" INTEGER NOT NULL DEFAULT 0,
    "politicalBias" "PoliticalBias" NOT NULL DEFAULT 'UNKNOWN',
    "biasScore" INTEGER NOT NULL DEFAULT 0,
    "reliability" "Reliability" NOT NULL DEFAULT 'UNKNOWN',
    "detectedCountry" TEXT DEFAULT 'FR',
    "isClickbait" BOOLEAN NOT NULL DEFAULT false,
    "pluralismScore" INTEGER NOT NULL DEFAULT 0,
    "pluralismDetails" JSONB,
    "type" TEXT NOT NULL DEFAULT 'GENERAL',
    "justification" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "auditCount" INTEGER NOT NULL DEFAULT 0,
    "lastAuditDate" TIMESTAMP(3),
    "mbfcRating" TEXT,
    "allSidesRating" TEXT,
    "adFontesScore" DOUBLE PRECISION,
    "isConsensusVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "articleId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 100,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Repost_userId_idx" ON "Repost"("userId");

-- CreateIndex
CREATE INDEX "Repost_articleId_idx" ON "Repost"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "Repost_userId_articleId_key" ON "Repost"("userId", "articleId");

-- CreateIndex
CREATE INDEX "Follow_followerId_idx" ON "Follow"("followerId");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "Source_domain_key" ON "Source"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_inviteCodeId_fkey" FOREIGN KEY ("inviteCodeId") REFERENCES "InviteCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUsage" ADD CONSTRAINT "UserUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

