-- Registre des actes des gouvernements (GovernmentAct) et références aux actes.
--
-- Migration additive : rien n'est renommé ni supprimé. Toutes les nouvelles colonnes sont
-- nullables, donc les lignes existantes restent valides sans backfill.
--
-- Dépend de 2026-10-09-government-entity.sql (tables Government et MandateGovernment).
-- À appliquer AVANT de déployer le code qui déclare ces champs : Prisma les sélectionne
-- explicitement et échouerait sur des colonnes absentes.
--
-- Les noms de tables, colonnes, contraintes et index sont ceux que Prisma génère, pour qu'un
-- `prisma migrate diff` ne voie aucune dérive.
--
-- Pas de bloc DO pour rendre CREATE TYPE et ADD CONSTRAINT idempotents : SEC-06 les interdit
-- dans les migrations. Le fichier s'exécute donc une seule fois, dans une transaction : rejoué,
-- il échoue au premier CREATE TYPE sans rien modifier, au lieu d'avaler l'erreur.
--
-- À exécuter avec `prisma db execute --file` (pas de db:push tant que le diff porte la
-- suppression de l'index HNSW SearchEmbedding_embedding_hnsw_idx). .env pointe sur la production.

BEGIN;

-- Énumérations
CREATE TYPE "GovernmentActKind" AS ENUM ('PRIME_MINISTER_APPOINTMENT', 'COMPOSITION', 'CESSATION', 'CURRENT_AFFAIRS', 'COMMUNIQUE', 'OTHER');

CREATE TYPE "DateDetermination" AS ENUM ('EXPLICIT', 'CONVENTION', 'DEDUCTION');

-- Table GovernmentAct
CREATE TABLE IF NOT EXISTS "GovernmentAct" (
  "id" TEXT NOT NULL,
  "kind" "GovernmentActKind" NOT NULL,
  "label" TEXT NOT NULL,
  "signedAt" DATE NOT NULL,
  "effectiveAt" DATE,
  "journalPublishedAt" DATE,
  "journalNumber" TEXT,
  "inForceAt" DATE,
  "url" TEXT NOT NULL,
  "jorfId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GovernmentAct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GovernmentAct_jorfId_key" ON "GovernmentAct"("jorfId");

-- Colonnes ajoutées à Government
ALTER TABLE "Government"
  ADD COLUMN IF NOT EXISTS "compositionCheckedAt" DATE,
  ADD COLUMN IF NOT EXISTS "primeMinisterAppointedActId" TEXT,
  ADD COLUMN IF NOT EXISTS "primeMinisterAppointedDetermination" "DateDetermination",
  ADD COLUMN IF NOT EXISTS "formedActId" TEXT,
  ADD COLUMN IF NOT EXISTS "formedDetermination" "DateDetermination",
  ADD COLUMN IF NOT EXISTS "resignedActId" TEXT,
  ADD COLUMN IF NOT EXISTS "resignedDetermination" "DateDetermination",
  ADD COLUMN IF NOT EXISTS "endedActId" TEXT,
  ADD COLUMN IF NOT EXISTS "endedDetermination" "DateDetermination",
  ADD COLUMN IF NOT EXISTS "currentAffairsActId" TEXT;

-- Colonnes ajoutées à MandateGovernment
ALTER TABLE "MandateGovernment"
  ADD COLUMN IF NOT EXISTS "startActId" TEXT,
  ADD COLUMN IF NOT EXISTS "startDetermination" "DateDetermination",
  ADD COLUMN IF NOT EXISTS "endActId" TEXT,
  ADD COLUMN IF NOT EXISTS "endDetermination" "DateDetermination",
  ADD COLUMN IF NOT EXISTS "currentAffairsEndedAt" DATE,
  ADD COLUMN IF NOT EXISTS "currentAffairsEndActId" TEXT,
  ADD COLUMN IF NOT EXISTS "currentAffairsEndDetermination" "DateDetermination";

-- Index
CREATE INDEX IF NOT EXISTS "Government_primeMinisterAppointedActId_idx" ON "Government"("primeMinisterAppointedActId");
CREATE INDEX IF NOT EXISTS "Government_formedActId_idx" ON "Government"("formedActId");
CREATE INDEX IF NOT EXISTS "Government_resignedActId_idx" ON "Government"("resignedActId");
CREATE INDEX IF NOT EXISTS "Government_endedActId_idx" ON "Government"("endedActId");
CREATE INDEX IF NOT EXISTS "Government_currentAffairsActId_idx" ON "Government"("currentAffairsActId");
CREATE INDEX IF NOT EXISTS "MandateGovernment_startActId_idx" ON "MandateGovernment"("startActId");
CREATE INDEX IF NOT EXISTS "MandateGovernment_endActId_idx" ON "MandateGovernment"("endActId");
CREATE INDEX IF NOT EXISTS "MandateGovernment_currentAffairsEndActId_idx" ON "MandateGovernment"("currentAffairsEndActId");

-- Clés étrangères
ALTER TABLE "Government" ADD CONSTRAINT "Government_primeMinisterAppointedActId_fkey"
  FOREIGN KEY ("primeMinisterAppointedActId") REFERENCES "GovernmentAct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Government" ADD CONSTRAINT "Government_formedActId_fkey"
  FOREIGN KEY ("formedActId") REFERENCES "GovernmentAct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Government" ADD CONSTRAINT "Government_resignedActId_fkey"
  FOREIGN KEY ("resignedActId") REFERENCES "GovernmentAct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Government" ADD CONSTRAINT "Government_endedActId_fkey"
  FOREIGN KEY ("endedActId") REFERENCES "GovernmentAct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Government" ADD CONSTRAINT "Government_currentAffairsActId_fkey"
  FOREIGN KEY ("currentAffairsActId") REFERENCES "GovernmentAct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MandateGovernment" ADD CONSTRAINT "MandateGovernment_startActId_fkey"
  FOREIGN KEY ("startActId") REFERENCES "GovernmentAct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MandateGovernment" ADD CONSTRAINT "MandateGovernment_endActId_fkey"
  FOREIGN KEY ("endActId") REFERENCES "GovernmentAct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MandateGovernment" ADD CONSTRAINT "MandateGovernment_currentAffairsEndActId_fkey"
  FOREIGN KEY ("currentAffairsEndActId") REFERENCES "GovernmentAct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
