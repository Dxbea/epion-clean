ALTER TYPE "EditorialReviewAuditAction" ADD VALUE 'ARTICLE_PUBLISHED';
ALTER TYPE "EditorialReviewAuditAction" ADD VALUE 'PUBLICATION_REVOKED';
ALTER TYPE "EditorialReviewAuditAction" ADD VALUE 'PUBLICATION_EXPIRED';

ALTER TYPE "EditorialPublicationAuthorizationStatus" ADD VALUE 'REVOKED';
ALTER TYPE "EditorialPublicationAuthorizationStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "EditorialPublicationAuthorizationStatus" ADD VALUE 'CONSUMED';

ALTER TABLE "Article" ADD COLUMN "publishedAt" TIMESTAMP(3);

ALTER TABLE "EditorialPublicationAuthorization"
    ADD COLUMN "expiresAt" TIMESTAMP(3),
    ADD COLUMN "consumedAt" TIMESTAMP(3),
    ADD COLUMN "revokedAt" TIMESTAMP(3),
    ADD COLUMN "revokedById" TEXT,
    ADD COLUMN "revocationReason" TEXT;

UPDATE "EditorialPublicationAuthorization"
SET "expiresAt" = "authorizedAt" + INTERVAL '24 hours'
WHERE "expiresAt" IS NULL;

ALTER TABLE "EditorialPublicationAuthorization"
    ALTER COLUMN "expiresAt" SET NOT NULL;

DROP INDEX "EditorialPublicationAuthorization_revisionId_key";

ALTER TABLE "EditorialPublicationAuthorization"
    DROP CONSTRAINT "EditorialPublicationAuthorization_invalidation_check";

ALTER TABLE "EditorialPublicationAuthorization"
    ADD CONSTRAINT "EditorialPublicationAuthorization_lifecycle_check" CHECK (
        "expiresAt" > "authorizedAt" AND (
            (
                "status" = 'AUTHORIZED'
                AND "consumedAt" IS NULL
                AND "revokedAt" IS NULL
                AND "revokedById" IS NULL
                AND "revocationReason" IS NULL
                AND "invalidatedAt" IS NULL
                AND "invalidationReason" IS NULL
            ) OR (
                "status" = 'INVALIDATED'
                AND "consumedAt" IS NULL
                AND "revokedAt" IS NULL
                AND "revokedById" IS NULL
                AND "revocationReason" IS NULL
                AND "invalidatedAt" IS NOT NULL
                AND "invalidationReason" IS NOT NULL
            ) OR (
                "status" = 'REVOKED'
                AND "consumedAt" IS NULL
                AND "revokedAt" IS NOT NULL
                AND "revokedById" IS NOT NULL
                AND "revocationReason" IS NOT NULL
                AND "invalidatedAt" IS NULL
                AND "invalidationReason" IS NULL
            ) OR (
                "status" = 'EXPIRED'
                AND "consumedAt" IS NULL
                AND "revokedAt" IS NULL
                AND "revokedById" IS NULL
                AND "revocationReason" IS NULL
                AND "invalidatedAt" IS NULL
                AND "invalidationReason" IS NULL
            ) OR (
                "status" = 'CONSUMED'
                AND "consumedAt" IS NOT NULL
                AND "revokedAt" IS NULL
                AND "revokedById" IS NULL
                AND "revocationReason" IS NULL
                AND "invalidatedAt" IS NULL
                AND "invalidationReason" IS NULL
            )
        )
    );

CREATE INDEX "Article_status_publishedAt_idx" ON "Article"("status", "publishedAt");
CREATE INDEX "EditorialPublicationAuthorization_revisionId_status_authorizedAt_idx"
    ON "EditorialPublicationAuthorization"("revisionId", "status", "authorizedAt");
CREATE INDEX "EditorialPublicationAuthorization_status_expiresAt_idx"
    ON "EditorialPublicationAuthorization"("status", "expiresAt");
CREATE INDEX "EditorialPublicationAuthorization_revokedById_revokedAt_idx"
    ON "EditorialPublicationAuthorization"("revokedById", "revokedAt");
CREATE UNIQUE INDEX "EditorialPublicationAuthorization_one_active_per_revision_key"
    ON "EditorialPublicationAuthorization"("revisionId") WHERE "status" = 'AUTHORIZED';

ALTER TABLE "EditorialPublicationAuthorization"
    ADD CONSTRAINT "EditorialPublicationAuthorization_revokedById_fkey"
    FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
