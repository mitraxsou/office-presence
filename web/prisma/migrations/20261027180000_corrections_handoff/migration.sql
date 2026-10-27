-- AlterEnum
ALTER TYPE "VisitSource" ADD VALUE IF NOT EXISTS 'correction';
ALTER TYPE "CorrectionStatus" ADD VALUE IF NOT EXISTS 'cancelled';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CorrectionIssue" AS ENUM ('missing_visit', 'wrong_times', 'wrong_office', 'should_not_count');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable Policy
ALTER TABLE "Policy" ADD COLUMN IF NOT EXISTS "correctionWindowDays" INTEGER NOT NULL DEFAULT 5;

-- AlterTable Visit
ALTER TABLE "Visit" ADD COLUMN IF NOT EXISTS "correctionId" TEXT;
CREATE INDEX IF NOT EXISTS "Visit_correctionId_idx" ON "Visit"("correctionId");

-- AlterTable VisitCorrectionRequest
ALTER TABLE "VisitCorrectionRequest" ADD COLUMN IF NOT EXISTS "issue" "CorrectionIssue";
ALTER TABLE "VisitCorrectionRequest" ADD COLUMN IF NOT EXISTS "recorded" JSONB;
ALTER TABLE "VisitCorrectionRequest" ADD COLUMN IF NOT EXISTS "requested" JSONB;
ALTER TABLE "VisitCorrectionRequest" ADD COLUMN IF NOT EXISTS "applied" JSONB;

-- One pending correction per user/day
CREATE UNIQUE INDEX IF NOT EXISTS "VisitCorrectionRequest_user_day_pending_uidx"
  ON "VisitCorrectionRequest" ("userId", "dayKey")
  WHERE status = 'pending';
