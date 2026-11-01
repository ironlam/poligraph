-- ImpactRegenerationLog : journal de la régénération des anciens impacts citoyens.
-- Run: npx prisma db execute --file prisma/migrations/manual/add_impact_regeneration_log.sql
-- Ne pas passer par db:push (diff avec DROP INDEX "SearchEmbedding_embedding_hnsw_idx").
-- Purement additif : une nouvelle table, aucune colonne existante touchée, le code déployé n'est pas affecté.
-- Rejouable : CREATE ... IF NOT EXISTS.
-- RLS activée sans politique : aucun accès par les clés anon ou authenticated (Prisma contourne).

CREATE TABLE IF NOT EXISTS "ImpactRegenerationLog" (
  "scrutinId" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "detail" TEXT,
  "handledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImpactRegenerationLog_pkey" PRIMARY KEY ("scrutinId"),
  CONSTRAINT "ImpactRegenerationLog_scrutinId_fkey"
    FOREIGN KEY ("scrutinId") REFERENCES "Scrutin"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ImpactRegenerationLog_handledAt_idx"
  ON "ImpactRegenerationLog"("handledAt");

ALTER TABLE "ImpactRegenerationLog" ENABLE ROW LEVEL SECURITY;
