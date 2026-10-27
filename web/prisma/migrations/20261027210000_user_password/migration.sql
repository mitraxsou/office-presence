-- Additive: optional password for email + password sign-in (bcrypt hash only).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
