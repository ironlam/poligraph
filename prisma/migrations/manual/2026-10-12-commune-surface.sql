-- Superficie des communes (Commune."surfaceHa"), #1052.
--
-- Migration additive : une colonne nullable, sans valeur par défaut, aucune ligne réécrite.
-- À appliquer AVANT le déploiement : tout `findUnique` sur Commune sans `select` lit la colonne.
-- Remplissage ensuite par : npm run sync:surfaces -- --dry-run, puis npm run sync:surfaces
SET lock_timeout = '3s';

ALTER TABLE "Commune" ADD COLUMN IF NOT EXISTS "surfaceHa" DOUBLE PRECISION;
