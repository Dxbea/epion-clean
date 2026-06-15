-- Better Auth foundation, additive only.
-- Legacy auth tables remain available during the migration phase.

ALTER TABLE "public"."User"
ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

UPDATE "public"."User"
SET "emailVerified" = true
WHERE "emailVerifiedAt" IS NOT NULL;

CREATE TABLE "public"."BetterAuthSession" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "BetterAuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."BetterAuthAccount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetterAuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."BetterAuthVerification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetterAuthVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BetterAuthSession_token_key"
ON "public"."BetterAuthSession"("token");

CREATE INDEX "BetterAuthSession_userId_idx"
ON "public"."BetterAuthSession"("userId");

CREATE INDEX "BetterAuthAccount_userId_idx"
ON "public"."BetterAuthAccount"("userId");

CREATE INDEX "BetterAuthVerification_identifier_idx"
ON "public"."BetterAuthVerification"("identifier");

ALTER TABLE "public"."BetterAuthSession"
ADD CONSTRAINT "BetterAuthSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."BetterAuthAccount"
ADD CONSTRAINT "BetterAuthAccount_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
