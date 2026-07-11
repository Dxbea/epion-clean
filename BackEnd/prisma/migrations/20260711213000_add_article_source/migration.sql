-- Additive article-to-source storage. Legacy Article.factCheckData remains unchanged.
CREATE TYPE "ArticleSourceRole" AS ENUM (
    'PRIMARY_EVIDENCE',
    'CONTEXT',
    'COUNTERPOINT',
    'OFFICIAL_STATEMENT',
    'BACKGROUND',
    'UNKNOWN'
);

CREATE TYPE "ArticleSourceSupportStrength" AS ENUM (
    'STRONG',
    'MODERATE',
    'WEAK',
    'UNKNOWN'
);

CREATE TYPE "ArticleSourceProvenance" AS ENUM (
    'WEB_SEARCH',
    'INTERNAL_RAG',
    'USER_PROVIDED',
    'EDITORIAL',
    'IMPORTED_LEGACY',
    'UNKNOWN'
);

CREATE TABLE "ArticleSource" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceUrlHash" TEXT NOT NULL,
    "role" "ArticleSourceRole" NOT NULL DEFAULT 'UNKNOWN',
    "supportStrength" "ArticleSourceSupportStrength" NOT NULL DEFAULT 'UNKNOWN',
    "provenance" "ArticleSourceProvenance" NOT NULL DEFAULT 'UNKNOWN',
    "profileSnapshot" JSONB,
    "profileVersion" INTEGER,
    "snapshotAt" TIMESTAMP(3),
    "position" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArticleSource_articleId_sourceUrlHash_key"
    ON "ArticleSource"("articleId", "sourceUrlHash");
CREATE INDEX "ArticleSource_articleId_position_idx"
    ON "ArticleSource"("articleId", "position");
CREATE INDEX "ArticleSource_sourceId_idx"
    ON "ArticleSource"("sourceId");
CREATE INDEX "ArticleSource_articleId_role_idx"
    ON "ArticleSource"("articleId", "role");

ALTER TABLE "ArticleSource"
    ADD CONSTRAINT "ArticleSource_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "Article"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArticleSource"
    ADD CONSTRAINT "ArticleSource_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "Source"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
