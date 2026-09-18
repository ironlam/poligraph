-- Additive source preservation for #564. No public indicator is activated here.
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
  ADD COLUMN "officialGroupsFetchedAt" TIMESTAMP(3),
  ADD COLUMN "officialGroupsIssues" JSONB;

CREATE TABLE "ScrutinOfficialGroupCount" (
  "id" TEXT NOT NULL,
  "scrutinId" TEXT NOT NULL,
  "organeRef" TEXT NOT NULL,
  "memberCount" INTEGER,
  "forCount" INTEGER,
  "againstCount" INTEGER,
  "abstainCount" INTEGER,
  "nonVoterCount" INTEGER,
  "voluntaryNonVoterCount" INTEGER,
  "majorityPosition" TEXT,
  "issues" JSONB NOT NULL DEFAULT '[]',
  "sourceHash" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrutinOfficialGroupCount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScrutinOfficialGroupCount_nonnegative" CHECK (
    "memberCount" >= 0 AND "forCount" >= 0 AND "againstCount" >= 0
    AND "abstainCount" >= 0 AND "nonVoterCount" >= 0 AND "voluntaryNonVoterCount" >= 0
  ),
  CONSTRAINT "ScrutinOfficialGroupCount_scrutinId_fkey"
    FOREIGN KEY ("scrutinId") REFERENCES "Scrutin"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The composite unique index also covers the foreign key for cascading deletes.
CREATE UNIQUE INDEX "ScrutinOfficialGroupCount_scrutinId_organeRef_key"
  ON "ScrutinOfficialGroupCount" ("scrutinId", "organeRef");
CREATE INDEX "ScrutinOfficialGroupCount_organeRef_idx"
  ON "ScrutinOfficialGroupCount" ("organeRef");

-- Internal source snapshot; public exposure needs a separate reviewed data path.
ALTER TABLE "ScrutinOfficialGroupCount" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ScrutinOfficialGroupCount" FROM PUBLIC, anon, authenticated;

COMMIT;
