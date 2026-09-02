-- Add candidacies to the central lexical index without changing existing document identities.
ALTER TYPE "SearchEntityType" ADD VALUE 'CANDIDACY';

-- Null is intentional for global document families such as questions. Election-bound indexers
-- backfill this value explicitly after deployment.
ALTER TABLE "SearchDocument" ADD COLUMN "electionId" TEXT;

CREATE INDEX "SearchDocument_electionId_visibility_idx"
ON "SearchDocument"("electionId", "visibility");
