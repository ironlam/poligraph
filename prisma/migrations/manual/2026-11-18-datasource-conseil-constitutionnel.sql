-- Parrainages présidentiels (Territoires v2, lot P) : valeur CONSEIL_CONSTITUTIONNEL de "DataSource".
--
-- Sert de source aux décisions d'identité qui relient une présentation à une fiche. Ajout seul :
-- aucune ligne existante n'est touchée, et une valeur d'énumération ne se retire pas.
-- NON APPLIQUÉE. À passer avant le premier lancement de sync:parrainages-elus :
--   npx prisma db execute --file prisma/migrations/manual/2026-11-18-datasource-conseil-constitutionnel.sql
-- (utilise DIRECT_URL).

ALTER TYPE "DataSource" ADD VALUE IF NOT EXISTS 'CONSEIL_CONSTITUTIONNEL';
