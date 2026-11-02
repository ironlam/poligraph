-- MeasureSource.startAtSeconds : début du passage dans une source audiovisuelle, en secondes.
-- Colonne nullable sans valeur par défaut : aucune réécriture de table, aucun verrou long,
-- l'ancien code l'ignore (Prisma liste ses colonnes), donc la migration passe AVANT le déploiement.
--
-- Appliqué à la main :
--   npx prisma db execute --file prisma/migrations/manual/add_measure_source_start_at.sql
-- Retour arrière :
--   ALTER TABLE "MeasureSource" DROP COLUMN "startAtSeconds";

ALTER TABLE "MeasureSource" ADD COLUMN IF NOT EXISTS "startAtSeconds" INTEGER;

-- Rattrapage : les horodatages saisis dans `page` depuis le 2026-10-21 ("22:41", "1:05:09").
-- `page` est conservé tel quel. Les pages de PDF ("12", "p. 12") ne correspondent pas au motif.
UPDATE "MeasureSource"
SET "startAtSeconds" = CASE
  WHEN "page" ~ '^[0-9]{1,2}:[0-5][0-9]$'
    THEN split_part("page", ':', 1)::int * 60 + split_part("page", ':', 2)::int
  ELSE split_part("page", ':', 1)::int * 3600
     + split_part("page", ':', 2)::int * 60
     + split_part("page", ':', 3)::int
END
WHERE "startAtSeconds" IS NULL
  AND "createdAt" >= TIMESTAMP '2026-10-21 00:00:00'
  AND "page" ~ '^[0-9]{1,2}(:[0-5][0-9]){1,2}$';
