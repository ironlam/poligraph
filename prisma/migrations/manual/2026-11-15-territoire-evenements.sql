-- Fil du territoire (Territoires v2, lot B) : TerritoireEvenement.
--
-- Migration additive : une table neuve, aucune colonne existante touchée. Réutilise les
-- énumérations "RepereTerritoryType" et "CurationStatus", déjà en base.
-- NON APPLIQUÉE. À relire en entier avant application, avec une sauvegarde pg_dump :
--   npx prisma db execute --file prisma/migrations/manual/2026-11-15-territoire-evenements.sql
-- (utilise DIRECT_URL).
-- Le lecteur tolère l'absence de la table (isMissingTableError) : le code peut partir avant ce
-- fichier.
--
-- La RLS est posée à la création par l'event trigger enable_rls_on_create ; le ALTER ci-dessous
-- est redondant et sans effet si elle l'est déjà. La politique ouvre à `anon` les seules lignes
-- PUBLISHED. Prisma se connecte en `postgres` et contourne la RLS : elle ne remplace pas le
-- filtre du lecteur.

-- CreateTable
CREATE TABLE "TerritoireEvenement" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "territoryType" "RepereTerritoryType" NOT NULL,
    "territoryCode" TEXT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "payload" JSONB NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" "CurationStatus" NOT NULL DEFAULT 'DRAFT',
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TerritoireEvenement_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "TerritoireEvenement_dedupeKey_key" ON "TerritoireEvenement"("dedupeKey");
-- CreateIndex
CREATE INDEX "TerritoireEvenement_territoryType_territoryCode_status_occu_idx" ON "TerritoireEvenement"("territoryType", "territoryCode", "status", "occurredOn");

-- Row Level Security : lecture publique des événements PUBLISHED seulement.
ALTER TABLE "TerritoireEvenement" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_published_territoire_evenements"
  ON "TerritoireEvenement" FOR SELECT TO anon
  USING ("status" = 'PUBLISHED');
