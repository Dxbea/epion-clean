-- AlterTable
ALTER TABLE "public"."Article" ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "factCheckData" JSONB,
ADD COLUMN     "factCheckScore" INTEGER;
