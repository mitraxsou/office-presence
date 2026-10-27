-- AlterTable User: profile, home office, test flag, deactivate
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "colleagueDisplayMode" TEXT NOT NULL DEFAULT 'first_last';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "homeOfficeId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isTestAccount" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);

-- Keep isTestAccount aligned with legacy isDummy
UPDATE "User" SET "isTestAccount" = true WHERE "isDummy" = true AND "isTestAccount" = false;

CREATE INDEX IF NOT EXISTS "User_homeOfficeId_idx" ON "User"("homeOfficeId");
CREATE INDEX IF NOT EXISTS "User_deactivatedAt_idx" ON "User"("deactivatedAt");

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_homeOfficeId_fkey"
    FOREIGN KEY ("homeOfficeId") REFERENCES "OfficeLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable UserNotificationPrefs
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "notifyCorrections" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "notifyTrackingProblems" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "quietHoursStart" TEXT;
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "quietHoursEnd" TEXT;

-- CreateTable ViewAsSession
CREATE TABLE IF NOT EXISTS "ViewAsSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViewAsSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ViewAsSession_adminId_endedAt_idx" ON "ViewAsSession"("adminId", "endedAt");
CREATE INDEX IF NOT EXISTS "ViewAsSession_targetUserId_idx" ON "ViewAsSession"("targetUserId");
CREATE INDEX IF NOT EXISTS "ViewAsSession_expiresAt_idx" ON "ViewAsSession"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "ViewAsSession" ADD CONSTRAINT "ViewAsSession_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ViewAsSession" ADD CONSTRAINT "ViewAsSession_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
