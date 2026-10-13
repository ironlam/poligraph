-- "Le territoire en chiffres" (#1052, kit v3, lot R0) : TerritoireRepere, RepereImport, RepereSource.
--
-- Migration additive : trois tables et trois énumérations neuves, aucune colonne existante touchée.
-- NON APPLIQUÉE. À relire en entier avant application, avec une sauvegarde pg_dump :
--   npx prisma db execute --file prisma/migrations/manual/2026-10-13-territoire-reperes.sql
-- (utilise DIRECT_URL).
-- Le code tolère l'absence des tables (isMissingTableError) : il peut partir avant ce fichier.
--
-- La RLS est posée à la création par l'event trigger enable_rls_on_create ; le ALTER ci-dessous
-- est redondant et sans effet si elle l'est déjà. Les politiques ouvrent à `anon` les seules lignes
-- d'un lot PUBLISHED, comme rls-public-read-policies.sql le fait pour les contenus publiés.
-- Prisma se connecte en `postgres` et contourne la RLS : elle ne remplace pas le filtre du lecteur.

-- CreateEnum
CREATE TYPE "RepereTerritoryType" AS ENUM ('COM', 'DEP', 'REG');
-- CreateEnum
CREATE TYPE "RepereScopeKind" AS ENUM ('COMMUNE', 'UDI', 'STATION', 'DEPARTEMENT');
-- CreateEnum
CREATE TYPE "RepereState" AS ENUM ('ETABLI', 'PARTIEL', 'NON_ETABLI', 'SECRET_STATISTIQUE', 'HORS_COUVERTURE');
-- CreateTable
CREATE TABLE "RepereSource" (
    "id" TEXT NOT NULL,
    "producer" TEXT NOT NULL,
    "resourceUrl" TEXT NOT NULL,
    "licenceName" TEXT NOT NULL,
    "licenceUrl" TEXT NOT NULL,
    "attribution" TEXT NOT NULL,
    "methodSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RepereSource_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "RepereImport" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "CurationStatus" NOT NULL DEFAULT 'DRAFT',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RepereImport_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "TerritoireRepere" (
    "id" TEXT NOT NULL,
    "territoryType" "RepereTerritoryType" NOT NULL,
    "territoryCode" TEXT NOT NULL,
    "cogEdition" TEXT,
    "indicatorKey" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "scopeKind" "RepereScopeKind" NOT NULL,
    "scopeId" TEXT NOT NULL DEFAULT '',
    "scopeLabel" TEXT,
    "value" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "sampleSize" INTEGER,
    "state" "RepereState" NOT NULL,
    "reason" TEXT,
    "importId" TEXT NOT NULL,
    CONSTRAINT "TerritoireRepere_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "RepereSource_methodSlug_idx" ON "RepereSource"("methodSlug");
-- CreateIndex
CREATE INDEX "RepereImport_sourceId_status_idx" ON "RepereImport"("sourceId", "status");
-- CreateIndex
CREATE INDEX "TerritoireRepere_importId_idx" ON "TerritoireRepere"("importId");
-- CreateIndex
CREATE UNIQUE INDEX "TerritoireRepere_territoryType_territoryCode_indicatorKey_p_key" ON "TerritoireRepere"("territoryType", "territoryCode", "indicatorKey", "periodEnd", "scopeKind", "scopeId");
-- AddForeignKey
ALTER TABLE "RepereImport" ADD CONSTRAINT "RepereImport_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RepereSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TerritoireRepere" ADD CONSTRAINT "TerritoireRepere_importId_fkey" FOREIGN KEY ("importId") REFERENCES "RepereImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security : lecture publique des lots PUBLISHED seulement.
ALTER TABLE "RepereSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RepereImport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TerritoireRepere" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_published_repere_imports"
  ON "RepereImport" FOR SELECT TO anon
  USING ("status" = 'PUBLISHED');

CREATE POLICY "anon_read_published_repere_sources"
  ON "RepereSource" FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM "RepereImport" i WHERE i."sourceId" = "RepereSource"."id" AND i."status" = 'PUBLISHED'
  ));

CREATE POLICY "anon_read_published_reperes"
  ON "TerritoireRepere" FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM "RepereImport" i WHERE i."id" = "TerritoireRepere"."importId" AND i."status" = 'PUBLISHED'
  ));
