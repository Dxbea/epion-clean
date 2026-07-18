CREATE TYPE "EditorialDraftStatus" AS ENUM (
    'PENDING', 'GENERATING', 'READY_FOR_REVIEW', 'QUALITY_FAILED', 'HUMAN_REJECTED',
    'ARTICLE_DRAFT_CREATED', 'FAILED'
);
CREATE TYPE "EditorialClaimImportance" AS ENUM ('CORE', 'SUPPORTING', 'CONTEXT');
CREATE TYPE "EditorialClaimVerdict" AS ENUM (
    'SUPPORTED', 'PARTIALLY_SUPPORTED', 'UNSUPPORTED', 'CONTRADICTED'
);
CREATE TYPE "EditorialGateDecision" AS ENUM ('PASSED', 'FAILED');
CREATE TYPE "EditorialHumanReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "EditorialDraft" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "draftVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "generatorModel" TEXT NOT NULL,
    "criticModel" TEXT NOT NULL,
    "status" "EditorialDraftStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT,
    "summary" TEXT,
    "contentHtml" TEXT,
    "structuredContent" JSONB,
    "contentHash" TEXT,
    "briefContentHash" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "configuration" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "error" TEXT,
    "metrics" JSONB,
    "generatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "articleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorialDraft_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialDraft_attempts_check" CHECK ("attempts" >= 0),
    CONSTRAINT "EditorialDraft_article_state_check" CHECK (
        "articleId" IS NULL OR "status" = 'ARTICLE_DRAFT_CREATED'
    )
);

CREATE TABLE "EditorialDraftClaim" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "claimKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "importance" "EditorialClaimImportance" NOT NULL,
    "evidenceKeys" JSONB NOT NULL,
    "citedDocumentIds" JSONB NOT NULL,
    "citedChunkIds" JSONB NOT NULL,
    "citedDomains" JSONB NOT NULL,
    "verdict" "EditorialClaimVerdict" NOT NULL,
    "criticExplanation" TEXT NOT NULL,
    "criticEvidenceKeys" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorialDraftClaim_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialDraftClaim_position_check" CHECK ("position" >= 0)
);

CREATE TABLE "EditorialQualityGate" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "gateVersion" TEXT NOT NULL,
    "qualityScore" DOUBLE PRECISION NOT NULL,
    "publishabilityScore" DOUBLE PRECISION NOT NULL,
    "citationCoverage" DOUBLE PRECISION NOT NULL,
    "supportedClaimRatio" DOUBLE PRECISION NOT NULL,
    "coreClaimSupportRatio" DOUBLE PRECISION NOT NULL,
    "independentDomains" INTEGER NOT NULL,
    "automatedDecision" "EditorialGateDecision" NOT NULL,
    "automatedReasons" JSONB NOT NULL,
    "thresholds" JSONB NOT NULL,
    "humanReviewStatus" "EditorialHumanReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "articleCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorialQualityGate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialQualityGate_scores_check" CHECK (
        "qualityScore" BETWEEN 0 AND 100 AND
        "publishabilityScore" BETWEEN 0 AND 100 AND
        "citationCoverage" BETWEEN 0 AND 1 AND
        "supportedClaimRatio" BETWEEN 0 AND 1 AND
        "coreClaimSupportRatio" BETWEEN 0 AND 1 AND
        "independentDomains" >= 0
    ),
    CONSTRAINT "EditorialQualityGate_human_review_check" CHECK (
        ("humanReviewStatus" = 'PENDING' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL) OR
        ("humanReviewStatus" IN ('APPROVED', 'REJECTED') AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL)
    ),
    CONSTRAINT "EditorialQualityGate_approval_requires_pass_check" CHECK (
        "humanReviewStatus" <> 'APPROVED' OR "automatedDecision" = 'PASSED'
    )
);

CREATE TABLE "EditorialDraftClaimEvidence" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "briefEvidenceId" TEXT NOT NULL,
    "citationOrder" INTEGER NOT NULL,
    "criticConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialDraftClaimEvidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialDraftClaimEvidence_order_check" CHECK ("citationOrder" >= 0)
);

CREATE UNIQUE INDEX "EditorialDraft_idempotencyKey_key" ON "EditorialDraft"("idempotencyKey");
CREATE UNIQUE INDEX "EditorialDraft_articleId_key" ON "EditorialDraft"("articleId");
CREATE INDEX "EditorialDraft_briefId_createdAt_idx" ON "EditorialDraft"("briefId", "createdAt");
CREATE INDEX "EditorialDraft_status_createdAt_idx" ON "EditorialDraft"("status", "createdAt");
CREATE UNIQUE INDEX "EditorialDraftClaim_draftId_claimKey_key" ON "EditorialDraftClaim"("draftId", "claimKey");
CREATE INDEX "EditorialDraftClaim_draftId_verdict_importance_idx" ON "EditorialDraftClaim"("draftId", "verdict", "importance");
CREATE UNIQUE INDEX "EditorialDraftClaimEvidence_claimId_briefEvidenceId_key"
    ON "EditorialDraftClaimEvidence"("claimId", "briefEvidenceId");
CREATE INDEX "EditorialDraftClaimEvidence_briefEvidenceId_idx"
    ON "EditorialDraftClaimEvidence"("briefEvidenceId");
CREATE INDEX "EditorialDraftClaimEvidence_claimId_citationOrder_idx"
    ON "EditorialDraftClaimEvidence"("claimId", "citationOrder");
CREATE UNIQUE INDEX "EditorialQualityGate_draftId_key" ON "EditorialQualityGate"("draftId");
CREATE INDEX "EditorialQualityGate_automatedDecision_humanReviewStatus_createdAt_idx"
    ON "EditorialQualityGate"("automatedDecision", "humanReviewStatus", "createdAt");
CREATE INDEX "EditorialQualityGate_reviewedById_reviewedAt_idx"
    ON "EditorialQualityGate"("reviewedById", "reviewedAt");

ALTER TABLE "EditorialDraft" ADD CONSTRAINT "EditorialDraft_briefId_fkey"
    FOREIGN KEY ("briefId") REFERENCES "EditorialBrief"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialDraft" ADD CONSTRAINT "EditorialDraft_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialDraftClaim" ADD CONSTRAINT "EditorialDraftClaim_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "EditorialDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorialQualityGate" ADD CONSTRAINT "EditorialQualityGate_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "EditorialDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorialQualityGate" ADD CONSTRAINT "EditorialQualityGate_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialDraftClaimEvidence" ADD CONSTRAINT "EditorialDraftClaimEvidence_claimId_fkey"
    FOREIGN KEY ("claimId") REFERENCES "EditorialDraftClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorialDraftClaimEvidence" ADD CONSTRAINT "EditorialDraftClaimEvidence_briefEvidenceId_fkey"
    FOREIGN KEY ("briefEvidenceId") REFERENCES "EditorialBriefEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
