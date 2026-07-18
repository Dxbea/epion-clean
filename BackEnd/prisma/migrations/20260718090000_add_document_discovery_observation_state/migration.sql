-- Additive observation state for passive corpus discovery.
ALTER TABLE "DocumentDiscovery"
    ADD COLUMN "canonicalHint" TEXT,
    ADD COLUMN "canonicalHintAccepted" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "seenCount" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "DocumentDiscovery_discoverySourceId_lastSeenAt_idx"
    ON "DocumentDiscovery"("discoverySourceId", "lastSeenAt");
