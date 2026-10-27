-- Replace singleton OfficeFence with OfficeLocation, add points, devices, prefs,
-- corrections, and peer consent. Safe on the existing deployed DB: the legacy
-- fence row is copied into OfficeLocation before OfficeFence is dropped.

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'points_met';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'daily_summary';

-- CreateEnum
CREATE TYPE "OfficeStatus" AS ENUM ('active', 'pending', 'rejected', 'inactive');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "User"
    ADD COLUMN "developerMode" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "sharePresenceWithPeers" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "sharePresenceConsentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DeviceToken"
    ADD COLUMN "label" TEXT,
    ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'android';

-- AlterTable
ALTER TABLE "Policy"
    ADD COLUMN "monthlyPointsTarget" INTEGER NOT NULL DEFAULT 8;

-- AlterTable
ALTER TABLE "PresenceEvent"
    ADD COLUMN "deviceTokenId" TEXT,
    ADD COLUMN "deviceName" TEXT,
    ADD COLUMN "officeLocationId" TEXT;

-- AlterTable
ALTER TABLE "Visit"
    ADD COLUMN "officeLocationId" TEXT,
    ADD COLUMN "pointsAwarded" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CurrentStatus"
    ADD COLUMN "pointsToday" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "monthPoints" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "monthVisitDays" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "officeLocationId" TEXT,
    ADD COLUMN "officeName" TEXT,
    ADD COLUMN "lastDeviceName" TEXT;

-- CreateTable
CREATE TABLE "OfficeLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "pointsPerVisitDay" INTEGER NOT NULL DEFAULT 1,
    "addressLabel" TEXT,
    "status" "OfficeStatus" NOT NULL DEFAULT 'active',
    "createdByUserId" TEXT,
    "approvedByAdminId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOfficeAlias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "officeLocationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOfficeAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationPrefs" (
    "userId" TEXT NOT NULL,
    "notifyOfficeDetected" BOOLEAN NOT NULL DEFAULT true,
    "notifyGoalMet" BOOLEAN NOT NULL DEFAULT true,
    "notifyDailySummary" BOOLEAN NOT NULL DEFAULT true,
    "notificationToneId" TEXT NOT NULL DEFAULT 'default',
    "launchSoundEnabled" BOOLEAN NOT NULL DEFAULT false,
    "launchSoundId" TEXT NOT NULL DEFAULT 'default',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotificationPrefs_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "VisitCorrectionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "proposedStart" TIMESTAMP(3) NOT NULL,
    "proposedEnd" TIMESTAMP(3) NOT NULL,
    "officeLocationId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitCorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfficeLocation_status_idx" ON "OfficeLocation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UserOfficeAlias_userId_officeLocationId_key" ON "UserOfficeAlias"("userId", "officeLocationId");

-- CreateIndex
CREATE INDEX "VisitCorrectionRequest_status_createdAt_idx" ON "VisitCorrectionRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VisitCorrectionRequest_userId_dayKey_idx" ON "VisitCorrectionRequest"("userId", "dayKey");

-- AddForeignKey
ALTER TABLE "OfficeLocation" ADD CONSTRAINT "OfficeLocation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeLocation" ADD CONSTRAINT "OfficeLocation_approvedByAdminId_fkey" FOREIGN KEY ("approvedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOfficeAlias" ADD CONSTRAINT "UserOfficeAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOfficeAlias" ADD CONSTRAINT "UserOfficeAlias_officeLocationId_fkey" FOREIGN KEY ("officeLocationId") REFERENCES "OfficeLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPrefs" ADD CONSTRAINT "UserNotificationPrefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenceEvent" ADD CONSTRAINT "PresenceEvent_deviceTokenId_fkey" FOREIGN KEY ("deviceTokenId") REFERENCES "DeviceToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenceEvent" ADD CONSTRAINT "PresenceEvent_officeLocationId_fkey" FOREIGN KEY ("officeLocationId") REFERENCES "OfficeLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitCorrectionRequest" ADD CONSTRAINT "VisitCorrectionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitCorrectionRequest" ADD CONSTRAINT "VisitCorrectionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentStatus" ADD CONSTRAINT "CurrentStatus_officeLocationId_fkey" FOREIGN KEY ("officeLocationId") REFERENCES "OfficeLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Copy the legacy singleton fence into one active location worth 1 point per visit day.
INSERT INTO "OfficeLocation" (
    "id", "name", "latitude", "longitude", "radiusMeters", "pointsPerVisitDay",
    "status", "createdByUserId", "approvedByAdminId", "approvedAt", "createdAt", "updatedAt"
)
SELECT
    'legacy-office-1',
    COALESCE(NULLIF(TRIM(f."name"), ''), 'Office'),
    f."latitude",
    f."longitude",
    f."radiusMeters",
    1,
    'active',
    u."id",
    u."id",
    COALESCE(f."setAt", CURRENT_TIMESTAMP),
    COALESCE(f."setAt", CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM "OfficeFence" f
LEFT JOIN "User" u ON u."id" = f."setByUserId"
WHERE f."id" = 1 AND f."latitude" IS NOT NULL AND f."longitude" IS NOT NULL;

-- DropTable
DROP TABLE "OfficeFence";
