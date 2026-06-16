DROP TABLE IF EXISTS "public"."EmailVerificationToken";
DROP TABLE IF EXISTS "public"."PasswordReset";
DROP TABLE IF EXISTS "public"."Session";

ALTER TABLE "public"."User"
DROP COLUMN IF EXISTS "passwordHash",
DROP COLUMN IF EXISTS "emailVerifiedAt";
