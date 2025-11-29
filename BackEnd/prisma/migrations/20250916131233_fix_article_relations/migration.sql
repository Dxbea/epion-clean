/*
  Warnings:

  - The primary key for the `ArticleStats` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `createdAt` on the `ArticleStats` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `ArticleStats` table. All the data in the column will be lost.
  - You are about to drop the column `ipHash` on the `ArticleView` table. All the data in the column will be lost.
  - You are about to drop the column `viewedAt` on the `ArticleView` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."ArticleView_articleId_viewedAt_idx";

-- AlterTable
ALTER TABLE "public"."ArticleStats" DROP CONSTRAINT "ArticleStats_pkey",
DROP COLUMN "createdAt",
DROP COLUMN "id";

-- AlterTable
ALTER TABLE "public"."ArticleView" DROP COLUMN "ipHash",
DROP COLUMN "viewedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "viewerHash" TEXT;

-- CreateIndex
CREATE INDEX "ArticleView_articleId_createdAt_idx" ON "public"."ArticleView"("articleId", "createdAt");

-- CreateIndex
CREATE INDEX "ArticleView_articleId_userId_createdAt_idx" ON "public"."ArticleView"("articleId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "ArticleView_articleId_viewerHash_createdAt_idx" ON "public"."ArticleView"("articleId", "viewerHash", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."ArticleView" ADD CONSTRAINT "ArticleView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
