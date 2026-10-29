-- Self-service corrections (approval flag, default off) and published app version.
-- fcmToken is added in 20261028140000_device_fcm_token.
ALTER TABLE "Policy" ADD COLUMN IF NOT EXISTS "correctionRequiresApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Policy" ADD COLUMN IF NOT EXISTS "appVersionCode" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Policy" ADD COLUMN IF NOT EXISTS "appVersionName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Policy" ADD COLUMN IF NOT EXISTS "appApkUrl" TEXT;

ALTER TABLE "DeviceToken" ADD COLUMN IF NOT EXISTS "appVersionCode" INTEGER;
ALTER TABLE "DeviceToken" ADD COLUMN IF NOT EXISTS "updateNotifiedVersionCode" INTEGER;
