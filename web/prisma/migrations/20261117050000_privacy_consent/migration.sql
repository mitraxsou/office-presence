-- Tracking consent and raw location retention (prompt 8).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "privacyConsentAt" TIMESTAMP(3),
ADD COLUMN     "privacyConsentVersion" TEXT;

-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "privacyNoticeVersion" TEXT NOT NULL DEFAULT '1',
ADD COLUMN     "rawLocationRetentionDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "requireConsent" BOOLEAN NOT NULL DEFAULT false;
