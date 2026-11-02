-- Index du tri chronologique des scrutins (voir add_scrutin_sequence.sql, à passer avant).
-- Run: npx prisma db execute --file prisma/migrations/manual/add_scrutin_sequence_index.sql

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Scrutin_votingDate_sequence_idx"
ON "Scrutin" ("votingDate" DESC, "sequence" DESC);
