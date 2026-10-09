-- Entité Government et preuves de dates sur MandateGovernment (phase « expand »).
--
-- Migration additive : rien n'est renommé ni supprimé. MandateGovernment."governmentName"
-- reste la source des lecteurs existants jusqu'à la phase « contract » (lot ultérieur).
-- Les nouvelles colonnes sont toutes nullables ou ont une valeur par défaut, donc les lignes
-- existantes restent valides sans backfill.
--
-- Idempotent : peut être rejoué sans erreur. Les noms de tables, colonnes, contraintes et
-- index sont ceux que Prisma génère, pour qu'un `prisma migrate diff` ne voie aucune dérive.
--
-- À exécuter avec `prisma db execute --file` (pas de db:push tant que le diff porte la
-- suppression de l'index HNSW SearchEmbedding_embedding_hnsw_idx). .env pointe sur la production.

-- Énumérations
DO $$ BEGIN
  CREATE TYPE "DateEvidence" AS ENUM ('ACT', 'DATASET', 'DERIVED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "GovernmentFunctionEnd" AS ENUM ('INDIVIDUAL', 'COLLECTIVE_RESIGNATION');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "GovernmentCompleteness" AS ENUM ('COMPLETE', 'PARTIAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Table Government
CREATE TABLE IF NOT EXISTS "Government" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "primeMinisterId" TEXT NOT NULL,
  "primeMinisterAppointedAt" DATE NOT NULL,
  "primeMinisterAppointedEvidence" "DateEvidence" NOT NULL,
  "primeMinisterAppointedSourceUrl" TEXT,
  "formedAt" DATE,
  "formedEvidence" "DateEvidence",
  "formedSourceUrl" TEXT,
  "resignedAt" DATE,
  "resignedEvidence" "DateEvidence",
  "resignedSourceUrl" TEXT,
  "endedAt" DATE,
  "endedEvidence" "DateEvidence",
  "endedSourceUrl" TEXT,
  "completeness" "GovernmentCompleteness" NOT NULL DEFAULT 'PARTIAL',
  "pendingChanges" INTEGER,
  "coverageNote" TEXT,
  "compositionVerifiedAt" DATE,
  "compositionVerifiedSourceUrl" TEXT,
  "publicationStatus" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Government_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Government_slug_key" ON "Government"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Government_sequence_key" ON "Government"("sequence");
CREATE INDEX IF NOT EXISTS "Government_publicationStatus_sequence_idx" ON "Government"("publicationStatus", "sequence");

-- Colonnes ajoutées à MandateGovernment
ALTER TABLE "MandateGovernment"
  ADD COLUMN IF NOT EXISTS "governmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "startEvidence" "DateEvidence",
  ADD COLUMN IF NOT EXISTS "startSourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "endEvidence" "DateEvidence",
  ADD COLUMN IF NOT EXISTS "endSourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "endKind" "GovernmentFunctionEnd",
  ADD COLUMN IF NOT EXISTS "predecessorId" TEXT,
  ADD COLUMN IF NOT EXISTS "sameDayOrderEstablished" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sameDayOrderSourceUrl" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "MandateGovernment_predecessorId_key" ON "MandateGovernment"("predecessorId");
CREATE INDEX IF NOT EXISTS "MandateGovernment_governmentId_idx" ON "MandateGovernment"("governmentId");

-- Clés étrangères (gardées par nom : ADD CONSTRAINT n'a pas de IF NOT EXISTS)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Government_primeMinisterId_fkey') THEN
    ALTER TABLE "Government" ADD CONSTRAINT "Government_primeMinisterId_fkey"
      FOREIGN KEY ("primeMinisterId") REFERENCES "Politician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MandateGovernment_governmentId_fkey') THEN
    ALTER TABLE "MandateGovernment" ADD CONSTRAINT "MandateGovernment_governmentId_fkey"
      FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MandateGovernment_predecessorId_fkey') THEN
    ALTER TABLE "MandateGovernment" ADD CONSTRAINT "MandateGovernment_predecessorId_fkey"
      FOREIGN KEY ("predecessorId") REFERENCES "MandateGovernment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
