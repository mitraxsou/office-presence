-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canGrantExceptions" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "allowExceptionsInClosedMonths" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allowSelfLeave" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "officeLocationId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresenceException" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "startDay" TEXT NOT NULL,
    "endDay" TEXT NOT NULL,
    "officeLocationId" TEXT NOT NULL,
    "pointsPerDay" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" TEXT,

    CONSTRAINT "PresenceException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresenceExceptionDay" (
    "id" TEXT NOT NULL,
    "exceptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "PresenceExceptionDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Holiday_dayKey_idx" ON "Holiday"("dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_dayKey_officeLocationId_key" ON "Holiday"("dayKey", "officeLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveDay_userId_dayKey_key" ON "LeaveDay"("userId", "dayKey");

-- CreateIndex
CREATE INDEX "PresenceException_userId_startDay_idx" ON "PresenceException"("userId", "startDay");

-- CreateIndex
CREATE INDEX "PresenceExceptionDay_userId_dayKey_idx" ON "PresenceExceptionDay"("userId", "dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "PresenceExceptionDay_exceptionId_dayKey_key" ON "PresenceExceptionDay"("exceptionId", "dayKey");

-- AddForeignKey
ALTER TABLE "LeaveDay" ADD CONSTRAINT "LeaveDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenceException" ADD CONSTRAINT "PresenceException_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenceExceptionDay" ADD CONSTRAINT "PresenceExceptionDay_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "PresenceException"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenceExceptionDay" ADD CONSTRAINT "PresenceExceptionDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
