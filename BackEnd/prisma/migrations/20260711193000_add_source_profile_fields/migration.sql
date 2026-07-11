-- Additive source profile storage. Existing score and legacy JSON fields remain unchanged.
ALTER TABLE "Source"
    ADD COLUMN "profileData" JSONB,
    ADD COLUMN "profileVersion" INTEGER,
    ADD COLUMN "profileConfidence" "ConfidenceLevel",
    ADD COLUMN "lastProfiledAt" TIMESTAMP(3),
    ADD COLUMN "publicTrustLabel" TEXT;
