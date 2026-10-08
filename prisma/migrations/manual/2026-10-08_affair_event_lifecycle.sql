-- Chronologie publique des affaires, lot 1: cycle de vie, précision de date, issue
-- Additive migration, can run before the code. RLS of "AffairEvent" is already enabled: untouched.
-- ADD VALUE statements sit before BEGIN: a new enum value cannot be used in the transaction that adds it.
-- Run with: npx prisma db execute --file prisma/migrations/manual/2026-10-08_affair_event_lifecycle.sql
-- Applied: not yet

ALTER TYPE "AffairEventType" ADD VALUE IF NOT EXISTS 'TEMOIN_ASSISTE';
ALTER TYPE "AffairEventType" ADD VALUE IF NOT EXISTS 'CLASSEMENT_SANS_SUITE';
ALTER TYPE "AffairEventType" ADD VALUE IF NOT EXISTS 'CONVOCATION_TRIBUNAL';
ALTER TYPE "AffairEventType" ADD VALUE IF NOT EXISTS 'COMPARUTION_IMMEDIATE';
ALTER TYPE "AffairEventType" ADD VALUE IF NOT EXISTS 'CRPC';
ALTER TYPE "AffairEventType" ADD VALUE IF NOT EXISTS 'RENVOI_AUDIENCE';
ALTER TYPE "AffairEventType" ADD VALUE IF NOT EXISTS 'DECISION_DEFINITIVE';

BEGIN;

-- CreateEnum
CREATE TYPE "AffairEventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETRACTED');

-- CreateEnum
CREATE TYPE "DatePrecision" AS ENUM ('DAY', 'MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "EventOccurrence" AS ENUM ('HELD', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "EventOutcome" AS ENUM ('CONDAMNATION', 'RELAXE', 'RELAXE_PARTIELLE', 'ACQUITTEMENT', 'CASSATION_RENVOI', 'CASSATION_SANS_RENVOI', 'REJET_POURVOI', 'AUTRE');

-- CreateEnum
CREATE TYPE "EventSourceKind" AS ENUM ('OFFICIAL', 'PRESS');

-- AlterTable
ALTER TABLE "AffairEvent"
  ADD COLUMN "status" "AffairEventStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "datePrecision" "DatePrecision" NOT NULL DEFAULT 'DAY',
  ADD COLUMN "dateEnd" TIMESTAMP(3),
  ADD COLUMN "occurrence" "EventOccurrence" NOT NULL DEFAULT 'HELD',
  ADD COLUMN "outcome" "EventOutcome",
  ADD COLUMN "court" TEXT,
  ADD COLUMN "incidental" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "corroborationUrl" TEXT,
  ADD COLUMN "sourceKind" "EventSourceKind",
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "retractedAt" TIMESTAMP(3),
  ADD COLUMN "retractionReason" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddConstraint
ALTER TABLE "AffairEvent" ADD CONSTRAINT "AffairEvent_precision_check"
  CHECK (("datePrecision" <> 'MONTH' OR extract(day from "date") = 1)
    AND ("datePrecision" <> 'YEAR' OR (extract(day from "date") = 1 AND extract(month from "date") = 1)));

ALTER TABLE "AffairEvent" ADD CONSTRAINT "AffairEvent_date_end_check"
  CHECK ("dateEnd" IS NULL OR ("type" = 'FAITS' AND "dateEnd" > "date"));

ALTER TABLE "AffairEvent" ADD CONSTRAINT "AffairEvent_retracted_check"
  CHECK ("status" <> 'RETRACTED' OR ("retractionReason" IS NOT NULL AND "retractedAt" IS NOT NULL));

ALTER TABLE "AffairEvent" ADD CONSTRAINT "AffairEvent_published_check"
  CHECK ("status" = 'DRAFT' OR ("publishedAt" IS NOT NULL AND "sourceUrl" IS NOT NULL AND "sourceKind" IS NOT NULL));

ALTER TABLE "AffairEvent" ADD CONSTRAINT "AffairEvent_outcome_check"
  CHECK ("outcome" IS NULL OR ("occurrence" = 'HELD' AND "type" IN ('JUGEMENT', 'ARRET_APPEL', 'ARRET_CASSATION')));

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AffairEvent_affairId_status_date_idx" ON "AffairEvent"("affairId", "status", "date");

COMMIT;
