-- Mandats locaux saisis dans l'admin (#1460, lot 0) : précision des dates d'un mandat, SIREN
-- d'intercommunalité, et valeur PRESIDENT_INTERCOMMUNALITE de "MandateType".
--
-- Ajouts seuls. Les lignes existantes prennent la précision DAY, qui décrit ce qu'elles
-- affichent déjà ; "epciSiren" reste vide. Une valeur d'énumération ne se retire pas.
-- Rejouable : chaque instruction porte IF NOT EXISTS.
-- Appliquée en production le 26 novembre 2026, avant le déploiement du code qui lit ces colonnes :
--   npx prisma db execute --file prisma/migrations/manual/2026-11-26-mandate-date-precision-epci.sql
-- (utilise DIRECT_URL).

ALTER TABLE "Mandate" ADD COLUMN IF NOT EXISTS "startDatePrecision" "DatePrecision" NOT NULL DEFAULT 'DAY';
ALTER TABLE "Mandate" ADD COLUMN IF NOT EXISTS "endDatePrecision" "DatePrecision" NOT NULL DEFAULT 'DAY';

ALTER TABLE "MandateLocal" ADD COLUMN IF NOT EXISTS "epciSiren" TEXT;

ALTER TYPE "MandateType" ADD VALUE IF NOT EXISTS 'PRESIDENT_INTERCOMMUNALITE';
