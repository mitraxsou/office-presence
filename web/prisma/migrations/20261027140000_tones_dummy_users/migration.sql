-- Per-kind notification tones and dummy peer-board users.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isDummy" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "notifyOfficeEnter" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "notifyOfficeLeave" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "toneEnterId" TEXT NOT NULL DEFAULT 'chime';
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "toneLeaveId" TEXT NOT NULL DEFAULT 'soft';
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "toneGoalId" TEXT NOT NULL DEFAULT 'pulse';
ALTER TABLE "UserNotificationPrefs" ADD COLUMN IF NOT EXISTS "toneSummaryId" TEXT NOT NULL DEFAULT 'default';
