/*
  Warnings:

  - You are about to drop the column `excerpt` on the `Article` table. All the data in the column will be lost.
  - You are about to drop the column `publishedAt` on the `Article` table. All the data in the column will be lost.
  - You are about to drop the column `views` on the `Article` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `SavedArticle` table. All the data in the column will be lost.
  - You are about to drop the column `ip` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `refreshToken` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `userAgent` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `avatarUrl` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `displayName` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `verified` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `ArticleTag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Tag` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `ChatSession` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "public"."ArticleTag" DROP CONSTRAINT "ArticleTag_articleId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ArticleTag" DROP CONSTRAINT "ArticleTag_tagId_fkey";

-- DropIndex
DROP INDEX "public"."Category_name_key";

-- DropIndex
DROP INDEX "public"."Session_refreshToken_key";

-- DropIndex
DROP INDEX "public"."User_username_key";

-- AlterTable
ALTER TABLE "public"."Article" DROP COLUMN "excerpt",
DROP COLUMN "publishedAt",
DROP COLUMN "views",
ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "status" "public"."ArticleStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "summary" TEXT,
ALTER COLUMN "content" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Category" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."ChatMessage" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "public"."ChatSession" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "public"."SavedArticle" DROP COLUMN "createdAt",
ADD COLUMN     "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."Session" DROP COLUMN "ip",
DROP COLUMN "refreshToken",
DROP COLUMN "userAgent",
ALTER COLUMN "expiresAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "avatarUrl",
DROP COLUMN "displayName",
DROP COLUMN "username",
DROP COLUMN "verified",
ADD COLUMN     "name" TEXT,
ADD COLUMN     "role" "public"."Role" NOT NULL DEFAULT 'USER',
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- DropTable
DROP TABLE "public"."ArticleTag";

-- DropTable
DROP TABLE "public"."Tag";

-- CreateIndex
CREATE INDEX "Article_authorId_idx" ON "public"."Article"("authorId");

-- CreateIndex
CREATE INDEX "Article_categoryId_idx" ON "public"."Article"("categoryId");

-- CreateIndex
CREATE INDEX "Article_status_createdAt_idx" ON "public"."Article"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ChatSession_userId_createdAt_idx" ON "public"."ChatSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedArticle_articleId_idx" ON "public"."SavedArticle"("articleId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- AddForeignKey
ALTER TABLE "public"."Article" ADD CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
