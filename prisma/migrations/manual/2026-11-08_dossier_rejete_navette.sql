-- Statut REJETE_NAVETTE (rejeté par une assemblée, procédure poursuivie) et
-- redirection des anciens slugs de dossiers. Additif : à appliquer AVANT le
-- déploiement du code qui lit ces colonnes.
--   npx prisma db execute --file prisma/migrations/manual/2026-11-08_dossier_rejete_navette.sql
ALTER TYPE "DossierStatus" ADD VALUE IF NOT EXISTS 'REJETE_NAVETTE';

ALTER TABLE "LegislativeDossier"
  ADD COLUMN IF NOT EXISTS "previousSlugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
