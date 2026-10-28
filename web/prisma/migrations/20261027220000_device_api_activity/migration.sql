-- Significant per-device API activity for admin diagnostics (Hobby-safe, 14-day prune).
CREATE TABLE IF NOT EXISTS "DeviceApiActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceTokenId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceApiActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DeviceApiActivity_deviceTokenId_at_idx" ON "DeviceApiActivity"("deviceTokenId", "at" DESC);
CREATE INDEX IF NOT EXISTS "DeviceApiActivity_userId_at_idx" ON "DeviceApiActivity"("userId", "at" DESC);

ALTER TABLE "DeviceApiActivity"
  ADD CONSTRAINT "DeviceApiActivity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeviceApiActivity"
  ADD CONSTRAINT "DeviceApiActivity_deviceTokenId_fkey"
  FOREIGN KEY ("deviceTokenId") REFERENCES "DeviceToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
