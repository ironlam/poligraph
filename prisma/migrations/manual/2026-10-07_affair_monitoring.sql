-- Private editorial follow-up of affairs: AffairMonitoring + AffairMonitoringCheck
-- Additive migration, can run before the code. RLS enabled with no policy (blocks anon/authenticated keys)
-- Prisma connects as postgres role which bypasses RLS, so this is safe
-- Run with: npx prisma db execute --file prisma/migrations/manual/2026-10-07_affair_monitoring.sql
-- Applied: not yet

BEGIN;

-- CreateEnum
CREATE TYPE "MonitoringDueReason" AS ENUM ('DELIBERE', 'AUDIENCE', 'DELAI_RECOURS', 'CADENCE', 'MANUEL');

-- CreateEnum
CREATE TYPE "MonitoringDateOrigin" AS ENUM ('HUMAN', 'AUTO_SOURCE', 'CADENCE');

-- CreateEnum
CREATE TYPE "MonitoringFlag" AS ENUM ('SIGNAL', 'GARDE_FOU');

-- CreateEnum
CREATE TYPE "MonitoringActor" AS ENUM ('HUMAN', 'AUTO');

-- CreateEnum
CREATE TYPE "MonitoringCheckOutcome" AS ENUM ('NO_CHANGE', 'NO_RESULT', 'DATE_ANNOUNCED', 'SIGNAL', 'UPDATED', 'FAILED', 'DEFERRED');

-- CreateTable
CREATE TABLE "AffairMonitoring" (
    "id" TEXT NOT NULL,
    "affairId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextReviewAt" TIMESTAMP(3) NOT NULL,
    "dueReason" "MonitoringDueReason" NOT NULL,
    "dueNote" TEXT,
    "dateOrigin" "MonitoringDateOrigin" NOT NULL,
    "consecutiveAutoDeferrals" INTEGER NOT NULL DEFAULT 0,
    "flaggedReason" "MonitoringFlag",
    "lastCheckedAt" TIMESTAMP(3),
    "lastAutoSearchAt" TIMESTAMP(3),
    "statusAtSchedule" "AffairStatus" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffairMonitoring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffairMonitoringCheck" (
    "id" TEXT NOT NULL,
    "monitoringId" TEXT NOT NULL,
    "checkKey" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" "MonitoringActor" NOT NULL,
    "actorId" TEXT,
    "outcome" "MonitoringCheckOutcome" NOT NULL,
    "proposalId" TEXT,
    "braveQueries" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "nextReviewAtAfter" TIMESTAMP(3),

    CONSTRAINT "AffairMonitoringCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffairMonitoring_affairId_key" ON "AffairMonitoring"("affairId");

-- CreateIndex
CREATE INDEX "AffairMonitoring_active_nextReviewAt_idx" ON "AffairMonitoring"("active", "nextReviewAt");

-- CreateIndex
CREATE INDEX "AffairMonitoring_active_flaggedReason_idx" ON "AffairMonitoring"("active", "flaggedReason");

-- CreateIndex
CREATE UNIQUE INDEX "AffairMonitoringCheck_checkKey_key" ON "AffairMonitoringCheck"("checkKey");

-- CreateIndex
CREATE INDEX "AffairMonitoringCheck_monitoringId_checkedAt_idx" ON "AffairMonitoringCheck"("monitoringId", "checkedAt");

-- CreateIndex
CREATE INDEX "AffairMonitoringCheck_checkedAt_idx" ON "AffairMonitoringCheck"("checkedAt");

-- AddForeignKey
ALTER TABLE "AffairMonitoring" ADD CONSTRAINT "AffairMonitoring_affairId_fkey" FOREIGN KEY ("affairId") REFERENCES "Affair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffairMonitoringCheck" ADD CONSTRAINT "AffairMonitoringCheck_monitoringId_fkey" FOREIGN KEY ("monitoringId") REFERENCES "AffairMonitoring"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security, no policy
ALTER TABLE "AffairMonitoring" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AffairMonitoringCheck" ENABLE ROW LEVEL SECURITY;

COMMIT;
