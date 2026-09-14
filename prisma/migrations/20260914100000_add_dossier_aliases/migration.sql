-- Editorial aliases are separate from the legal title because one dossier can
-- have several sourced, moderated public appellations.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TYPE "DossierAliasKind" AS ENUM ('MEDIA', 'COMMON', 'OFFICIAL_SHORT', 'HISTORICAL');

CREATE TABLE "LegislativeDossierAlias" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "normalizedLabel" TEXT NOT NULL,
    "kind" "DossierAliasKind" NOT NULL,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LegislativeDossierAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegislativeDossierAlias_dossierId_normalizedLabel_key"
  ON "LegislativeDossierAlias"("dossierId", "normalizedLabel");
CREATE INDEX "LegislativeDossierAlias_normalizedLabel_idx"
  ON "LegislativeDossierAlias"("normalizedLabel");
CREATE INDEX "LegislativeDossierAlias_dossierId_status_idx"
  ON "LegislativeDossierAlias"("dossierId", "status");
CREATE UNIQUE INDEX "LegislativeDossierAlias_one_published_preferred_idx"
  ON "LegislativeDossierAlias"("dossierId")
  WHERE "isPreferred" = true AND "status" = 'PUBLISHED';

ALTER TABLE "LegislativeDossierAlias"
  ADD CONSTRAINT "LegislativeDossierAlias_dossierId_fkey"
  FOREIGN KEY ("dossierId") REFERENCES "LegislativeDossier"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- SEC-03: public access goes through the application, which filters publication
-- status. Direct Data API access must not expose drafts or editorial audit fields.
ALTER TABLE "LegislativeDossierAlias" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "LegislativeDossierAlias" FROM PUBLIC, anon, authenticated;

COMMIT;
