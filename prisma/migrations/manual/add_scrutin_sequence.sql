-- Scrutin.sequence : numéro final de l'externalId (VTANR5L17V9097 -> 9097, SENAT-2024-330 -> 330).
-- votingDate ne porte que le jour : sequence départage les scrutins d'une même séance.
-- Run: npx prisma db execute --file prisma/migrations/manual/add_scrutin_sequence.sql
-- puis add_scrutin_sequence_index.sql (CONCURRENTLY refuse la transaction de db execute).
-- Ne pas passer par db:push (diff avec DROP INDEX "SearchEmbedding_embedding_hnsw_idx").
-- Colonne NOT NULL DEFAULT 0 : le code déjà déployé n'est pas affecté.

ALTER TABLE "Scrutin" ADD COLUMN IF NOT EXISTS "sequence" INTEGER NOT NULL DEFAULT 0;

UPDATE "Scrutin"
SET "sequence" = substring("externalId" from '([0-9]+)$')::int
WHERE "sequence" = 0 AND "externalId" ~ '[0-9]+$';
