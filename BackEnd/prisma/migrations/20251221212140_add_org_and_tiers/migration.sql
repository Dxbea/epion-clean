-- CreateEnum
CREATE TYPE "public"."SubscriptionTier" AS ENUM ('FREE', 'READER', 'PREMIUM');

-- CreateEnum
CREATE TYPE "public"."OrganizationRole" AS ENUM ('MEMBER', 'ADMIN');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "creditsArticle" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dailyQueryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "organizationRole" "public"."OrganizationRole",
ADD COLUMN     "subscriptionTier" "public"."SubscriptionTier" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "public"."Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
