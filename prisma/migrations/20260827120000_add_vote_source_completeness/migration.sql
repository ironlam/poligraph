-- CreateEnum
CREATE TYPE "IndividualVoteDataStatus" AS ENUM (
  'UNVERIFIED',
  'COMPLETE',
  'INCOMPLETE',
  'INVALID'
);

-- AlterTable
ALTER TABLE "PoliticianParticipation"
ADD COLUMN "computationVersion" TEXT;

-- CreateTable
CREATE TABLE "ScrutinVoteImport" (
  "id" TEXT NOT NULL,
  "scrutinId" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "expectedCount" INTEGER NOT NULL,
  "observedCount" INTEGER NOT NULL,
  "resolvedCount" INTEGER NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "status" "IndividualVoteDataStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "statusReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScrutinVoteImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinVoteImport_counts_check" CHECK (
    "expectedCount" >= 0
    AND "observedCount" >= 0
    AND "resolvedCount" >= 0
    AND "resolvedCount" <= "observedCount"
  ),
  CONSTRAINT "ScrutinVoteImport_complete_check" CHECK (
    "status" <> 'COMPLETE'
    OR ("observedCount" = "expectedCount" AND "statusReason" IS NULL)
  )
);

-- CreateIndex
CREATE UNIQUE INDEX "ScrutinVoteImport_scrutinId_key" ON "ScrutinVoteImport"("scrutinId");

-- CreateIndex
CREATE INDEX "ScrutinVoteImport_status_idx" ON "ScrutinVoteImport"("status");

-- AddForeignKey
ALTER TABLE "ScrutinVoteImport"
ADD CONSTRAINT "ScrutinVoteImport_scrutinId_fkey"
FOREIGN KEY ("scrutinId") REFERENCES "Scrutin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Internal audit data is not exposed through the Supabase Data API.
ALTER TABLE "ScrutinVoteImport" ENABLE ROW LEVEL SECURITY;
