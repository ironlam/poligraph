-- Superficie des communes (Commune."surfaceHa"), #1052.
--
-- Migration additive : une colonne nullable, sans valeur par défaut, aucune ligne réécrite.
-- Remplissage ensuite par : npm run sync:surfaces -- --dry-run, puis npm run sync:surfaces
ALTER TABLE "Commune" ADD COLUMN "surfaceHa" DOUBLE PRECISION;
