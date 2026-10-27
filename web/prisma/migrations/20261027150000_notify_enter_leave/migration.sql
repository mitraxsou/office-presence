-- Separate toggles for office enter vs leave alerts.
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "notifyOfficeEnter" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "notifyOfficeLeave" BOOLEAN NOT NULL DEFAULT true;

-- Keep enter/leave aligned with the legacy combined flag for existing rows.
UPDATE "UserNotificationPrefs"
SET "notifyOfficeEnter" = "notifyOfficeDetected",
    "notifyOfficeLeave" = "notifyOfficeDetected";
