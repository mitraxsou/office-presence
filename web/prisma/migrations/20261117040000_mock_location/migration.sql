-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "rejectMockLocations" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PresenceEvent" ADD COLUMN     "mockLocation" BOOLEAN NOT NULL DEFAULT false;
