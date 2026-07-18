ALTER TYPE "EditorialDraftStatus" ADD VALUE 'REVISION_PENDING_GATE' AFTER 'GENERATING';

ALTER TYPE "EditorialReviewAuditAction" ADD VALUE 'CORRECTION_CREATED';
ALTER TYPE "EditorialReviewAuditAction" ADD VALUE 'GATE_RECALCULATED';
ALTER TYPE "EditorialReviewAuditAction" ADD VALUE 'DRAFT_APPROVED';
ALTER TYPE "EditorialReviewAuditAction" ADD VALUE 'DRAFT_REJECTED';
ALTER TYPE "EditorialReviewAuditAction" ADD VALUE 'PUBLICATION_AUTHORIZED';
ALTER TYPE "EditorialReviewAuditAction" ADD VALUE 'DECISIONS_INVALIDATED';

CREATE TYPE "EditorialRevisionOrigin" AS ENUM ('GENERATED', 'ADMIN_CORRECTION');
CREATE TYPE "EditorialRevisionStatus" AS ENUM (
    'PENDING_CRITIC', 'GATE_PASSED', 'GATE_FAILED', 'APPROVED', 'REJECTED', 'SUPERSEDED'
);
CREATE TYPE "EditorialReviewDecisionType" AS ENUM ('APPROVE_DRAFT', 'REJECT_DRAFT');
CREATE TYPE "EditorialPublicationAuthorizationStatus" AS ENUM ('AUTHORIZED', 'INVALIDATED');
CREATE TYPE "EditorialPublicationDecisionType" AS ENUM ('AUTHORIZE_PUBLICATION');

ALTER TABLE "EditorialDraft" ADD COLUMN "currentRevisionId" TEXT;

CREATE TABLE "EditorialDraftRevision" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "parentRevisionId" TEXT,
    "origin" "EditorialRevisionOrigin" NOT NULL,
    "status" "EditorialRevisionStatus" NOT NULL DEFAULT 'PENDING_CRITIC',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "structuredContent" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "decisionType" "EditorialPublicationDecisionType" NOT NULL DEFAULT 'AUTHORIZE_PUBLICATION',
    "correctedById" TEXT,
    "correctionNote" TEXT,
    "criticModel" TEXT,
    "criticPromptVersion" TEXT,
    "criticReviews" JSONB,
    "gateSnapshot" JSONB,
    "gateEvaluatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialDraftRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialDraftRevision_version_check" CHECK ("version" > 0),
    CONSTRAINT "EditorialDraftRevision_correction_actor_check" CHECK (
        ("origin" = 'GENERATED' AND "correctedById" IS NULL AND "correctionNote" IS NULL) OR
        ("origin" = 'ADMIN_CORRECTION' AND "correctedById" IS NOT NULL AND "correctionNote" IS NOT NULL AND length(trim("correctionNote")) >= 10)
    )
);

INSERT INTO "EditorialDraftRevision" (
    "id", "draftId", "version", "origin", "status", "title", "summary", "contentHtml",
    "structuredContent", "contentHash", "criticModel", "gateSnapshot", "gateEvaluatedAt", "approvedAt", "createdAt"
)
SELECT
    'edrev_' || md5(draft."id"),
    draft."id",
    1,
    'GENERATED'::"EditorialRevisionOrigin",
    CASE
        WHEN draft."status" = 'READY_FOR_REVIEW' THEN 'GATE_PASSED'::"EditorialRevisionStatus"
        WHEN draft."status" = 'QUALITY_FAILED' THEN 'GATE_FAILED'::"EditorialRevisionStatus"
        WHEN draft."status" = 'ARTICLE_DRAFT_CREATED' THEN 'APPROVED'::"EditorialRevisionStatus"
        WHEN draft."status" = 'HUMAN_REJECTED' THEN 'REJECTED'::"EditorialRevisionStatus"
        ELSE 'PENDING_CRITIC'::"EditorialRevisionStatus"
    END,
    draft."title",
    draft."summary",
    draft."contentHtml",
    draft."structuredContent",
    draft."contentHash",
    draft."criticModel",
    CASE WHEN gate."id" IS NULL THEN NULL ELSE jsonb_build_object(
        'gateVersion', gate."gateVersion",
        'qualityScore', gate."qualityScore",
        'publishabilityScore', gate."publishabilityScore",
        'citationCoverage', gate."citationCoverage",
        'supportedClaimRatio', gate."supportedClaimRatio",
        'coreClaimSupportRatio', gate."coreClaimSupportRatio",
        'independentDomains', gate."independentDomains",
        'automatedDecision', gate."automatedDecision",
        'reasons', gate."automatedReasons",
        'thresholds', gate."thresholds"
    ) END,
    gate."createdAt",
    CASE WHEN gate."humanReviewStatus" = 'APPROVED' THEN gate."reviewedAt" END,
    COALESCE(draft."generatedAt", draft."createdAt")
FROM "EditorialDraft" draft
LEFT JOIN "EditorialQualityGate" gate ON gate."draftId" = draft."id"
WHERE draft."title" IS NOT NULL
  AND draft."summary" IS NOT NULL
  AND draft."contentHtml" IS NOT NULL
  AND draft."structuredContent" IS NOT NULL
  AND draft."contentHash" IS NOT NULL;

UPDATE "EditorialDraft" draft
SET "currentRevisionId" = revision."id"
FROM "EditorialDraftRevision" revision
WHERE revision."draftId" = draft."id" AND revision."version" = 1;

CREATE TABLE "EditorialReviewDecision" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "decisionType" "EditorialReviewDecisionType" NOT NULL,
    "contentHash" TEXT NOT NULL,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "invalidatedAt" TIMESTAMP(3),
    "invalidationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialReviewDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialReviewDecision_invalidation_check" CHECK (
        ("active" = true AND "invalidatedAt" IS NULL AND "invalidationReason" IS NULL) OR
        ("active" = false AND "invalidatedAt" IS NOT NULL AND "invalidationReason" IS NOT NULL)
    )
);

INSERT INTO "EditorialReviewDecision" (
    "id", "draftId", "revisionId", "adminUserId", "decisionType", "contentHash", "note", "createdAt"
)
SELECT
    'eddec_' || md5(gate."id"),
    gate."draftId",
    draft."currentRevisionId",
    gate."reviewedById",
    CASE
        WHEN gate."humanReviewStatus" = 'APPROVED' THEN 'APPROVE_DRAFT'::"EditorialReviewDecisionType"
        ELSE 'REJECT_DRAFT'::"EditorialReviewDecisionType"
    END,
    gate."evaluatedContentHash",
    gate."reviewNote",
    gate."reviewedAt"
FROM "EditorialQualityGate" gate
JOIN "EditorialDraft" draft ON draft."id" = gate."draftId"
WHERE gate."humanReviewStatus" IN ('APPROVED', 'REJECTED')
  AND gate."reviewedById" IS NOT NULL
  AND gate."reviewedAt" IS NOT NULL
  AND draft."currentRevisionId" IS NOT NULL;

CREATE TABLE "EditorialPublicationAuthorization" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "draftApproverId" TEXT NOT NULL,
    "authorizedById" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" "EditorialPublicationAuthorizationStatus" NOT NULL DEFAULT 'AUTHORIZED',
    "note" TEXT,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invalidatedAt" TIMESTAMP(3),
    "invalidationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorialPublicationAuthorization_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EditorialPublicationAuthorization_four_eyes_check" CHECK ("draftApproverId" <> "authorizedById"),
    CONSTRAINT "EditorialPublicationAuthorization_invalidation_check" CHECK (
        ("status" = 'AUTHORIZED' AND "invalidatedAt" IS NULL AND "invalidationReason" IS NULL) OR
        ("status" = 'INVALIDATED' AND "invalidatedAt" IS NOT NULL AND "invalidationReason" IS NOT NULL)
    )
);

ALTER TABLE "EditorialReviewAuditLog" ADD COLUMN "revisionId" TEXT;
UPDATE "EditorialReviewAuditLog" log
SET "revisionId" = draft."currentRevisionId"
FROM "EditorialDraft" draft
WHERE draft."id" = log."draftId";

ALTER TABLE "EditorialDraft" DROP CONSTRAINT "EditorialDraft_article_state_check";
ALTER TABLE "EditorialDraft" ADD CONSTRAINT "EditorialDraft_article_state_check" CHECK (
    "articleId" IS NULL OR "status" IN (
        'REVISION_PENDING_GATE', 'READY_FOR_REVIEW', 'QUALITY_FAILED',
        'HUMAN_REJECTED', 'ARTICLE_DRAFT_CREATED', 'FAILED'
    )
);

CREATE UNIQUE INDEX "EditorialDraft_currentRevisionId_key" ON "EditorialDraft"("currentRevisionId");
CREATE UNIQUE INDEX "EditorialDraftRevision_draftId_version_key" ON "EditorialDraftRevision"("draftId", "version");
CREATE INDEX "EditorialDraftRevision_draftId_createdAt_idx" ON "EditorialDraftRevision"("draftId", "createdAt");
CREATE INDEX "EditorialDraftRevision_status_createdAt_idx" ON "EditorialDraftRevision"("status", "createdAt");
CREATE INDEX "EditorialDraftRevision_contentHash_idx" ON "EditorialDraftRevision"("contentHash");
CREATE INDEX "EditorialDraftRevision_correctedById_createdAt_idx" ON "EditorialDraftRevision"("correctedById", "createdAt");
CREATE UNIQUE INDEX "EditorialReviewDecision_revisionId_decisionType_adminUserId_key"
    ON "EditorialReviewDecision"("revisionId", "decisionType", "adminUserId");
CREATE INDEX "EditorialReviewDecision_draftId_active_createdAt_idx"
    ON "EditorialReviewDecision"("draftId", "active", "createdAt");
CREATE INDEX "EditorialReviewDecision_adminUserId_createdAt_idx"
    ON "EditorialReviewDecision"("adminUserId", "createdAt");
CREATE UNIQUE INDEX "EditorialPublicationAuthorization_revisionId_key"
    ON "EditorialPublicationAuthorization"("revisionId");
CREATE INDEX "EditorialPublicationAuthorization_draftId_status_createdAt_idx"
    ON "EditorialPublicationAuthorization"("draftId", "status", "createdAt");
CREATE INDEX "EditorialPublicationAuthorization_articleId_status_idx"
    ON "EditorialPublicationAuthorization"("articleId", "status");
CREATE INDEX "EditorialPublicationAuthorization_draftApproverId_createdAt_idx"
    ON "EditorialPublicationAuthorization"("draftApproverId", "createdAt");
CREATE INDEX "EditorialPublicationAuthorization_authorizedById_createdAt_idx"
    ON "EditorialPublicationAuthorization"("authorizedById", "createdAt");
CREATE INDEX "EditorialReviewAuditLog_revisionId_createdAt_idx"
    ON "EditorialReviewAuditLog"("revisionId", "createdAt");

ALTER TABLE "EditorialDraftRevision" ADD CONSTRAINT "EditorialDraftRevision_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "EditorialDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorialDraftRevision" ADD CONSTRAINT "EditorialDraftRevision_parentRevisionId_fkey"
    FOREIGN KEY ("parentRevisionId") REFERENCES "EditorialDraftRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialDraftRevision" ADD CONSTRAINT "EditorialDraftRevision_correctedById_fkey"
    FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialDraft" ADD CONSTRAINT "EditorialDraft_currentRevisionId_fkey"
    FOREIGN KEY ("currentRevisionId") REFERENCES "EditorialDraftRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EditorialReviewDecision" ADD CONSTRAINT "EditorialReviewDecision_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "EditorialDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialReviewDecision" ADD CONSTRAINT "EditorialReviewDecision_revisionId_fkey"
    FOREIGN KEY ("revisionId") REFERENCES "EditorialDraftRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialReviewDecision" ADD CONSTRAINT "EditorialReviewDecision_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EditorialPublicationAuthorization" ADD CONSTRAINT "EditorialPublicationAuthorization_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "EditorialDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialPublicationAuthorization" ADD CONSTRAINT "EditorialPublicationAuthorization_revisionId_fkey"
    FOREIGN KEY ("revisionId") REFERENCES "EditorialDraftRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialPublicationAuthorization" ADD CONSTRAINT "EditorialPublicationAuthorization_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialPublicationAuthorization" ADD CONSTRAINT "EditorialPublicationAuthorization_draftApproverId_fkey"
    FOREIGN KEY ("draftApproverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditorialPublicationAuthorization" ADD CONSTRAINT "EditorialPublicationAuthorization_authorizedById_fkey"
    FOREIGN KEY ("authorizedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EditorialReviewAuditLog" ADD CONSTRAINT "EditorialReviewAuditLog_revisionId_fkey"
    FOREIGN KEY ("revisionId") REFERENCES "EditorialDraftRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
