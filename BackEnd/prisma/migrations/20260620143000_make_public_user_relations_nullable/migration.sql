-- Public content authored by a deleted account must survive account deletion.

ALTER TABLE "public"."Article"
DROP CONSTRAINT "Article_authorId_fkey";

ALTER TABLE "public"."Article"
ADD CONSTRAINT "Article_authorId_fkey"
FOREIGN KEY ("authorId")
REFERENCES "public"."User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "public"."ArticleContribution"
DROP CONSTRAINT "ArticleContribution_userId_fkey";

ALTER TABLE "public"."ArticleContribution"
ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "public"."ArticleContribution"
ADD CONSTRAINT "ArticleContribution_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "public"."User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "public"."ArticleContributionReport"
DROP CONSTRAINT "ArticleContributionReport_reporterId_fkey";

ALTER TABLE "public"."ArticleContributionReport"
ALTER COLUMN "reporterId" DROP NOT NULL;

ALTER TABLE "public"."ArticleContributionReport"
ADD CONSTRAINT "ArticleContributionReport_reporterId_fkey"
FOREIGN KEY ("reporterId")
REFERENCES "public"."User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
