-- AlterTable
ALTER TABLE "PresenceEvent" ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "trusted" BOOLEAN NOT NULL DEFAULT true;
