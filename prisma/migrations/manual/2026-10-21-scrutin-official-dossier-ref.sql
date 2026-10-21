-- Référence officielle du dossier portée par le scrutin de l'Assemblée nationale.
-- À appliquer en production avant le déploiement du code qui lit et écrit cette colonne.
-- Exécuter avec `npx prisma db execute --file prisma/migrations/manual/2026-10-21-scrutin-official-dossier-ref.sql`
-- (DIRECT_URL est utilisé par prisma.config.ts). La migration Prisma horodatée reste utilisée
-- pour les bases neuves et locales.

ALTER TABLE "Scrutin"
  ADD COLUMN IF NOT EXISTS "officialDossierRef" TEXT;

CREATE INDEX IF NOT EXISTS "Scrutin_officialDossierRef_idx"
  ON "Scrutin"("officialDossierRef");
