ALTER TYPE "EditorialReviewAuditAction" ADD VALUE 'VERIFICATION_REPLAYED';
ALTER TYPE "EditorialReviewAuditAction" ADD VALUE 'VERIFICATION_DLQ_REPLAYED';
ALTER TYPE "EditorialReviewAuditAction" ADD VALUE 'VERIFICATION_RECONCILED';

ALTER TABLE "EditorialReviewAuditLog"
  ADD COLUMN "operationKey" TEXT;

CREATE UNIQUE INDEX "EditorialReviewAuditLog_operationKey_key"
  ON "EditorialReviewAuditLog"("operationKey");
