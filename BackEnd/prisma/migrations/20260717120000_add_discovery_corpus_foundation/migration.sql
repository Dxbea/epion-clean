-- Additive foundation for configurable discovery sources and a raw editorial corpus.
-- Existing Article, NewsCache, routes, queues, and workers remain unchanged.
CREATE TYPE "DiscoveryConnectorType" AS ENUM (
    'RSS',
    'ATOM',
    'SITEMAP',
    'SITEMAP_INDEX',
    'GDELT',
    'GOOGLE_NEWS_RSS',
    'OFFICIAL_API',
    'HTML_LISTING',
    'MANUAL'
);

CREATE TYPE "DiscoveryAccessPolicy" AS ENUM (
    'FEED_ONLY',
    'ROBOTS_ALLOWED',
    'EXPLICIT_ALLOWLIST',
    'OFFICIAL_API',
    'LICENSED',
    'METADATA_ONLY',
    'BLOCKED'
);

CREATE TYPE "DiscoveryContentStoragePolicy" AS ENUM (
    'FULL_TEXT',
    'EXCERPT_ONLY',
    'METADATA_ONLY',
    'TRANSIENT',
    'NONE'
);

CREATE TYPE "IngestedDocumentStatus" AS ENUM (
    'DISCOVERED',
    'FETCH_PENDING',
    'FETCHED',
    'PARTIAL',
    'BLOCKED',
    'FAILED'
);

CREATE TABLE "DiscoverySource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connectorType" "DiscoveryConnectorType" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT,
    "country" TEXT,
    "categoryId" TEXT,
    "sourceId" TEXT,
    "schedule" TEXT,
    "maxItemsPerRun" INTEGER NOT NULL DEFAULT 100,
    "requestTimeoutMs" INTEGER NOT NULL DEFAULT 20000,
    "rateLimitPerHour" INTEGER,
    "configuration" JSONB,
    "cursor" TEXT,
    "etag" TEXT,
    "lastModified" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "disabledReason" TEXT,
    "accessPolicy" "DiscoveryAccessPolicy" NOT NULL DEFAULT 'METADATA_ONLY',
    "storagePolicy" "DiscoveryContentStoragePolicy" NOT NULL DEFAULT 'METADATA_ONLY',
    "licenseNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoverySource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IngestedDocument" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "canonicalUrlHash" TEXT NOT NULL,
    "canonicalizationVersion" INTEGER NOT NULL DEFAULT 1,
    "domain" TEXT NOT NULL,
    "title" TEXT,
    "snippet" TEXT,
    "content" TEXT,
    "contentHash" TEXT,
    "language" TEXT,
    "publishedAt" TIMESTAMP(3),
    "sourceUpdatedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchedAt" TIMESTAMP(3),
    "status" "IngestedDocumentStatus" NOT NULL DEFAULT 'DISCOVERED',
    "extractionMethod" TEXT,
    "accessPolicy" "DiscoveryAccessPolicy" NOT NULL DEFAULT 'METADATA_ONLY',
    "storagePolicy" "DiscoveryContentStoragePolicy" NOT NULL DEFAULT 'METADATA_ONLY',
    "robotsAllowed" BOOLEAN,
    "robotsCheckedAt" TIMESTAMP(3),
    "licenseDecision" TEXT,
    "sourceId" TEXT,
    "isIndexed" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestedDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentDiscovery" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "discoverySourceId" TEXT NOT NULL,
    "externalId" TEXT,
    "discoveredUrl" TEXT NOT NULL,
    "discoveredUrlHash" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "DocumentDiscovery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscoverySource_key_key" ON "DiscoverySource"("key");
CREATE INDEX "DiscoverySource_enabled_nextRunAt_idx" ON "DiscoverySource"("enabled", "nextRunAt");
CREATE INDEX "DiscoverySource_connectorType_endpoint_idx" ON "DiscoverySource"("connectorType", "endpoint");
CREATE INDEX "DiscoverySource_categoryId_idx" ON "DiscoverySource"("categoryId");
CREATE INDEX "DiscoverySource_sourceId_idx" ON "DiscoverySource"("sourceId");

CREATE UNIQUE INDEX "IngestedDocument_canonicalUrlHash_key" ON "IngestedDocument"("canonicalUrlHash");
CREATE INDEX "IngestedDocument_domain_publishedAt_idx" ON "IngestedDocument"("domain", "publishedAt");
CREATE INDEX "IngestedDocument_sourceId_publishedAt_idx" ON "IngestedDocument"("sourceId", "publishedAt");
CREATE INDEX "IngestedDocument_status_discoveredAt_idx" ON "IngestedDocument"("status", "discoveredAt");
CREATE INDEX "IngestedDocument_contentHash_idx" ON "IngestedDocument"("contentHash");

CREATE UNIQUE INDEX "DocumentDiscovery_discoverySourceId_discoveredUrlHash_key"
    ON "DocumentDiscovery"("discoverySourceId", "discoveredUrlHash");
CREATE UNIQUE INDEX "DocumentDiscovery_discoverySourceId_externalId_key"
    ON "DocumentDiscovery"("discoverySourceId", "externalId");
CREATE INDEX "DocumentDiscovery_documentId_discoveredAt_idx"
    ON "DocumentDiscovery"("documentId", "discoveredAt");
CREATE INDEX "DocumentDiscovery_discoverySourceId_discoveredAt_idx"
    ON "DocumentDiscovery"("discoverySourceId", "discoveredAt");

ALTER TABLE "DiscoverySource"
    ADD CONSTRAINT "DiscoverySource_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DiscoverySource"
    ADD CONSTRAINT "DiscoverySource_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "Source"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IngestedDocument"
    ADD CONSTRAINT "IngestedDocument_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "Source"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentDiscovery"
    ADD CONSTRAINT "DocumentDiscovery_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "IngestedDocument"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentDiscovery"
    ADD CONSTRAINT "DocumentDiscovery_discoverySourceId_fkey"
    FOREIGN KEY ("discoverySourceId") REFERENCES "DiscoverySource"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
