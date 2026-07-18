CREATE TYPE "EditorialShadowPublicationDecision" AS ENUM (
  'WOULD_AUTO_PUBLISH',
  'WOULD_REQUIRE_HUMAN',
  'WOULD_REJECT'
);

ALTER TABLE "EditorialVerificationRun"
  ADD COLUMN "shadowDecision" "EditorialShadowPublicationDecision",
  ADD COLUMN "shadowPolicyVersion" TEXT,
  ADD COLUMN "shadowReasons" JSONB,
  ADD COLUMN "shadowEvaluatedAt" TIMESTAMP(3);

CREATE INDEX "EditorialVerificationRun_shadowDecision_shadowEvaluatedAt_idx"
  ON "EditorialVerificationRun"("shadowDecision", "shadowEvaluatedAt");

CREATE TABLE "EditorialVerificationDailyUsage" (
  "day" DATE NOT NULL,
  "verificationCount" INTEGER NOT NULL DEFAULT 0,
  "serperRequestCount" INTEGER NOT NULL DEFAULT 0,
  "mistralRequestCount" INTEGER NOT NULL DEFAULT 0,
  "openaiRequestCount" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostMicros" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EditorialVerificationDailyUsage_pkey" PRIMARY KEY ("day")
);
