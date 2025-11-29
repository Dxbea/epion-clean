/*
  Warnings:

  - Changed the type of `role` on the `ChatMessage` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "public"."ChatRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "public"."Rigor" AS ENUM ('fast', 'balanced', 'precise');

-- DropIndex
DROP INDEX "public"."ChatSession_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "public"."ChatMessage" ADD COLUMN     "metadata" JSONB,
DROP COLUMN "role",
ADD COLUMN     "role" "public"."ChatRole" NOT NULL;

-- AlterTable
ALTER TABLE "public"."ChatSession" ADD COLUMN     "folderId" TEXT,
ADD COLUMN     "mode" "public"."Rigor" NOT NULL DEFAULT 'balanced';

-- CreateTable
CREATE TABLE "public"."ChatFolder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatFolder_userId_name_key" ON "public"."ChatFolder"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_token_key" ON "public"."PasswordReset"("token");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_expiresAt_idx" ON "public"."PasswordReset"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "ChatSession_userId_updatedAt_idx" ON "public"."ChatSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatSession_folderId_idx" ON "public"."ChatSession"("folderId");

-- AddForeignKey
ALTER TABLE "public"."ChatFolder" ADD CONSTRAINT "ChatFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatSession" ADD CONSTRAINT "ChatSession_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "public"."ChatFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
