-- AlterTable
ALTER TABLE "public"."Article" ADD COLUMN     "aiLockedFields" JSONB,
ADD COLUMN     "generatedAt" TIMESTAMP(3),
ADD COLUMN     "generationConfig" JSONB,
ADD COLUMN     "generationPrompt" TEXT,
ADD COLUMN     "generationVersion" INTEGER NOT NULL DEFAULT 0;
