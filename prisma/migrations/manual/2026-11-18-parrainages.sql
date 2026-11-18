-- Parrainages présidentiels (Territoires v2, lot P) : Parrainage.
--
-- Migration additive : une table neuve, aucune colonne existante touchée. Trois clés étrangères
-- vers "Election", "Candidacy" et "Politician", déjà en base.
-- NON APPLIQUÉE. À relire en entier avant application, avec une sauvegarde pg_dump :
--   npx prisma db execute --file prisma/migrations/manual/2026-11-18-parrainages.sql
-- (utilise DIRECT_URL).
--
-- Une ligne par présentation publiée par le Conseil constitutionnel. Les colonnes publiées sont
-- écrites une fois par l'importeur ; seules les colonnes résolues ("communeCode",
-- "departmentCode", "candidacyId", "politicianId") sont renseignées ensuite.
--
-- La RLS est posée à la création par l'event trigger enable_rls_on_create ; le ALTER ci-dessous
-- est redondant et sans effet si elle l'est déjà. La liste est officielle et publique en entier :
-- la politique ouvre toutes les lignes à `anon`, en lecture seule. Aucun GRANT (SEC-03). Prisma se
-- connecte en `postgres` et contourne la RLS.

-- CreateTable
CREATE TABLE "Parrainage" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "candidacyId" TEXT,
    "civility" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "mandateLabel" TEXT NOT NULL,
    "constituencyLabel" TEXT NOT NULL,
    "departmentLabel" TEXT NOT NULL,
    "communeCode" TEXT,
    "departmentCode" TEXT,
    "publishedOn" DATE NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "politicianId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Parrainage_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "Parrainage_dedupeKey_key" ON "Parrainage"("dedupeKey");
-- CreateIndex
CREATE INDEX "Parrainage_electionId_candidateName_idx" ON "Parrainage"("electionId", "candidateName");
-- CreateIndex
CREATE INDEX "Parrainage_electionId_departmentCode_idx" ON "Parrainage"("electionId", "departmentCode");
-- CreateIndex
CREATE INDEX "Parrainage_communeCode_idx" ON "Parrainage"("communeCode");
-- CreateIndex
CREATE INDEX "Parrainage_politicianId_idx" ON "Parrainage"("politicianId");

-- AddForeignKey
ALTER TABLE "Parrainage" ADD CONSTRAINT "Parrainage_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Parrainage" ADD CONSTRAINT "Parrainage_candidacyId_fkey" FOREIGN KEY ("candidacyId") REFERENCES "Candidacy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Parrainage" ADD CONSTRAINT "Parrainage_politicianId_fkey" FOREIGN KEY ("politicianId") REFERENCES "Politician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security : lecture publique de toutes les lignes, aucune écriture.
ALTER TABLE "Parrainage" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_parrainages"
  ON "Parrainage" FOR SELECT TO anon
  USING (true);
