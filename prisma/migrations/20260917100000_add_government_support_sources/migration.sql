-- Additive source preservation for #564. No public indicator is activated here.
-- Apply this committed migration, not only `prisma db push`: CHECK constraints,
-- RLS and role revocations are not represented by the Prisma datamodel.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TYPE "DossierOrigin" AS ENUM ('GOUVERNEMENTALE', 'PARLEMENTAIRE', 'INDETERMINEE');

ALTER TABLE "LegislativeDossier"
  ADD COLUMN "origin" "DossierOrigin" NOT NULL DEFAULT 'INDETERMINEE',
  ADD COLUMN "originDocumentRef" TEXT,
  ADD COLUMN "originReason" TEXT,
  ADD COLUMN "originEvidence" JSONB,
  ADD COLUMN "originSourceHash" TEXT,
  ADD COLUMN "originSourceUrl" TEXT,
  ADD COLUMN "originFetchedAt" TIMESTAMP(3);

ALTER TABLE "Scrutin"
  ADD COLUMN "codeTypeVote" TEXT,
  ADD COLUMN "libelleTypeVote" TEXT,
  ADD COLUMN "officialGroupsHash" TEXT,
  ADD COLUMN "officialGroupsSourceHash" TEXT,
  ADD COLUMN "officialGroupsSourceUrl" TEXT,
  ADD COLUMN "officialGroupsSourceFetchedAt" TIMESTAMP(3),
  ADD COLUMN "officialGroupsIssues" JSONB;

CREATE TABLE "ScrutinOfficialGroupCount" (
  "id" TEXT NOT NULL,
  "scrutinId" TEXT NOT NULL,
  "sourceIndex" INTEGER NOT NULL,
  "organeRef" TEXT,
  "memberCount" INTEGER,
  "forCount" INTEGER,
  "againstCount" INTEGER,
  "abstainCount" INTEGER,
  "nonVoterCount" INTEGER,
  "voluntaryNonVoterCount" INTEGER,
  "majorityPosition" TEXT,
  "issues" JSONB NOT NULL DEFAULT '[]',
  CONSTRAINT "ScrutinOfficialGroupCount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinOfficialGroupCount_nonnegative" CHECK (
    "memberCount" >= 0 AND "forCount" >= 0 AND "againstCount" >= 0
    AND "abstainCount" >= 0 AND "nonVoterCount" >= 0 AND "voluntaryNonVoterCount" >= 0
  ),
  CONSTRAINT "ScrutinOfficialGroupCount_scrutinId_fkey"
    FOREIGN KEY ("scrutinId") REFERENCES "Scrutin"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The source order preserves every official block, including malformed archives
-- where several distinct groups share the same organeRef (notably PO0).
CREATE UNIQUE INDEX "ScrutinOfficialGroupCount_scrutinId_sourceIndex_key"
  ON "ScrutinOfficialGroupCount" ("scrutinId", "sourceIndex");
CREATE INDEX "ScrutinOfficialGroupCount_organeRef_idx"
  ON "ScrutinOfficialGroupCount" ("organeRef");

-- Internal source snapshot; public exposure needs a separate reviewed data path.
ALTER TABLE "ScrutinOfficialGroupCount" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ScrutinOfficialGroupCount" FROM PUBLIC, anon, authenticated;

COMMIT;
