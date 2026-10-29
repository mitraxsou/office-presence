-- Quiet hours days and which alerts still sound during that window.
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "quietHoursDays" TEXT NOT NULL DEFAULT 'all';
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "quietHoursCustomDays" TEXT NOT NULL DEFAULT '1,2,3,4,5';
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "quietAlertTracking" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "quietAlertCorrections" BOOLEAN NOT NULL DEFAULT false;
