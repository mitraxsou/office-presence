-- Hide a deleted office from the admin list. The row stays so past visits keep their office.
-- Deactivated offices stay listed with status inactive and deletedAt null.
ALTER TABLE "OfficeLocation" ADD COLUMN "deletedAt" TIMESTAMP(3);
