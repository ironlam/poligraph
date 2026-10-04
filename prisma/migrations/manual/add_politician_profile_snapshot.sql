-- PoliticianProfileSnapshot: one precomputed profile document per politician (PR #956).
--
-- Applied by hand instead of `db:push`, because the schema diff also carries
-- `DROP INDEX "SearchEmbedding_embedding_hnsw_idx"`: that pgvector index lives in the database but
-- cannot be declared in schema.prisma, and `db:push` would drop it with the rest of the diff.
-- These statements are exactly the PoliticianProfileSnapshot part of
-- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`.
--
-- Run from the repository root (uses DIRECT_URL from prisma.config.ts):
--   npx prisma db execute --file prisma/migrations/manual/add_politician_profile_snapshot.sql
--
-- RLS is enabled by the `enable_rls_on_create` event trigger. No anon policy is added on purpose:
-- the documents are read by the app through the postgres role only.

BEGIN;

CREATE TABLE "PoliticianProfileSnapshot" (
    "id" TEXT NOT NULL,
    "politicianId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "builtAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoliticianProfileSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PoliticianProfileSnapshot_politicianId_key" ON "PoliticianProfileSnapshot"("politicianId");

ALTER TABLE "PoliticianProfileSnapshot" ADD CONSTRAINT "PoliticianProfileSnapshot_politicianId_fkey" FOREIGN KEY ("politicianId") REFERENCES "Politician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
