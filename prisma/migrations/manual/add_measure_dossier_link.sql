-- MeasureDossierLink : lien relu entre une mesure publiée et un dossier législatif.
-- Run: npx prisma db execute --file prisma/migrations/manual/add_measure_dossier_link.sql
-- Ne pas passer par db:push (diff avec DROP INDEX "SearchEmbedding_embedding_hnsw_idx").
-- Purement additif : une nouvelle table, aucune colonne existante touchée, le code déployé n'est pas affecté.
-- RLS activée sans politique : aucun accès par les clés anon ou authenticated (Prisma contourne).

DO $$ BEGIN
  CREATE TYPE "MeasureDossierLinkKind" AS ENUM ('SAME_OBJECT', 'BROADER_TEXT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MeasureDossierLink" (
  "id" TEXT NOT NULL,
  "measureId" TEXT NOT NULL,
  "applicableRevisionId" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "linkKind" "MeasureDossierLinkKind" NOT NULL,
  "measureQuote" TEXT NOT NULL,
  "textQuote" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "searchMethod" TEXT NOT NULL,
  "reviewedBy" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MeasureDossierLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MeasureDossierLink_applicableRevisionId_dossierId_key"
  ON "MeasureDossierLink"("applicableRevisionId", "dossierId");
CREATE INDEX IF NOT EXISTS "MeasureDossierLink_measureId_idx" ON "MeasureDossierLink"("measureId");
CREATE INDEX IF NOT EXISTS "MeasureDossierLink_dossierId_idx" ON "MeasureDossierLink"("dossierId");

DO $$ BEGIN
  ALTER TABLE "MeasureDossierLink"
    ADD CONSTRAINT "MeasureDossierLink_measureId_fkey"
    FOREIGN KEY ("measureId") REFERENCES "Measure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "MeasureDossierLink"
    ADD CONSTRAINT "MeasureDossierLink_applicableRevisionId_fkey"
    FOREIGN KEY ("applicableRevisionId") REFERENCES "MeasureRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "MeasureDossierLink"
    ADD CONSTRAINT "MeasureDossierLink_dossierId_fkey"
    FOREIGN KEY ("dossierId") REFERENCES "LegislativeDossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "MeasureDossierLink" ENABLE ROW LEVEL SECURITY;
