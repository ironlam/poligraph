-- Ajoute position en dernière colonne de Vote_politicianId_chamber_votingDate_idx : la
-- répartition des positions par chambre (getPoliticianVotingStats) devient un index-only scan.
--
-- Run: psql "$DIRECT_URL" -X -f prisma/migrations/manual/2026-10-25-vote-chamber-index-position.sql
--
-- psql sur DIRECT_URL (5432), ni prisma db execute ni DATABASE_URL (6543) : plusieurs
-- instructions CONCURRENTLY à la suite, qui refusent toute transaction. Ni db:push, qui
-- reconstruirait l'index sans CONCURRENTLY, donc sous verrou d'écriture sur Vote.
\set ON_ERROR_STOP on
\timing on

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Vote_pid_chamber_date_pos_tmp"
ON "Vote" ("politicianId", chamber, "votingDate" DESC, "position");

-- Attendu : t | t, et position en dernière colonne. Un index invalide se supprime
-- (DROP INDEX CONCURRENTLY "Vote_pid_chamber_date_pos_tmp") avant de relancer.
SELECT i.indisvalid, i.indisready, pg_get_indexdef(i.indexrelid)
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname = 'Vote_pid_chamber_date_pos_tmp';

\prompt 'indisvalid et indisready à t ? Entrée pour continuer, Ctrl+C pour arrêter ' ok

DROP INDEX CONCURRENTLY "Vote_politicianId_chamber_votingDate_idx";
ALTER INDEX "Vote_pid_chamber_date_pos_tmp" RENAME TO "Vote_politicianId_chamber_votingDate_idx";

-- Contrôle sur l'élu au plus grand nombre de votes AN : attendu Index Only Scan,
-- Heap Fetches proche de 0.
SELECT "politicianId" AS pid FROM "Vote" WHERE chamber = 'AN'
GROUP BY 1 ORDER BY count(*) DESC LIMIT 1 \gset

EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*), "position"::text FROM "Vote"
WHERE "politicianId" = :'pid' AND chamber = 'AN' AND "votingDate" >= '2024-07-01'
GROUP BY "position" OFFSET 0;
