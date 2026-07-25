-- Affaires v2, lot 1: importers stop mutating existing affairs directly and
-- emit reviewable proposals instead.
--
-- This file documents the SQL equivalent of the schema change. It is NOT the
-- deployment path: this database has no _prisma_migrations table, so it is
-- managed with `prisma db push`. Kept here for review and for the day a
-- versioned-migration baseline is established.

CREATE TYPE "ImportRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TYPE "ProposalStatus" AS ENUM (
  'PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPLIED', 'CONFLICT'
);

CREATE TYPE "ProposalRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

CREATE TABLE "ImportRun" (
  "id"         TEXT NOT NULL,
  "importer"   TEXT NOT NULL,
  "status"     "ImportRunStatus" NOT NULL DEFAULT 'RUNNING',
  "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "error"      TEXT,
  "stats"      JSONB,
  CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportRun_importer_startedAt_idx" ON "ImportRun" ("importer", "startedAt");
CREATE INDEX "ImportRun_status_idx" ON "ImportRun" ("status");

CREATE TABLE "AffairUpdateProposal" (
  "id"               TEXT NOT NULL,
  "affairId"         TEXT NOT NULL,
  "importer"         TEXT NOT NULL,
  "importRunId"      TEXT,
  "proposedPatch"    JSONB NOT NULL,
  "observedValues"   JSONB NOT NULL,
  "source"           "SourceType" NOT NULL,
  "sourceUrl"        TEXT,
  "officialId"       TEXT,
  "sourceExcerpt"    TEXT,
  "metadata"         JSONB,
  "confidence"       INTEGER NOT NULL,
  "riskLevel"        "ProposalRisk" NOT NULL,
  "rationale"        TEXT NOT NULL,
  "extractorVersion" TEXT NOT NULL DEFAULT 'v1',
  "payloadHash"      TEXT NOT NULL,
  "status"           "ProposalStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedAt"       TIMESTAMP(3),
  "reviewedBy"       TEXT,
  "reviewNotes"      TEXT,
  "appliedAt"        TIMESTAMP(3),
  "conflictDetail"   JSONB,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AffairUpdateProposal_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AffairUpdateProposal"
  ADD CONSTRAINT "AffairUpdateProposal_affairId_fkey"
  FOREIGN KEY ("affairId") REFERENCES "Affair" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AffairUpdateProposal"
  ADD CONSTRAINT "AffairUpdateProposal_importRunId_fkey"
  FOREIGN KEY ("importRunId") REFERENCES "ImportRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Idempotency: same importer replaying the same patch on the same affair from the
-- same source and extractor version collapses onto one row.
CREATE UNIQUE INDEX "AffairUpdateProposal_affairId_importer_payloadHash_key"
  ON "AffairUpdateProposal" ("affairId", "importer", "payloadHash");

CREATE INDEX "AffairUpdateProposal_status_riskLevel_idx"
  ON "AffairUpdateProposal" ("status", "riskLevel");
CREATE INDEX "AffairUpdateProposal_affairId_idx"
  ON "AffairUpdateProposal" ("affairId");
CREATE INDEX "AffairUpdateProposal_importRunId_idx"
  ON "AffairUpdateProposal" ("importRunId");
CREATE INDEX "AffairUpdateProposal_status_createdAt_idx"
  ON "AffairUpdateProposal" ("status", "createdAt");
