-- AffairStatus : ajout de CONDAMNATION_EN_APPEL (#1281).
-- Purement additif. À passer AVANT le merge du code (base d'abord, code ensuite) :
--   npx prisma db execute --file prisma/migrations/manual/2026-11-13_affair_status_condamnation_en_appel.sql
-- Rollback : le code cesse de l'utiliser, la valeur reste en place, inerte (Postgres n'a pas de DROP VALUE).

ALTER TYPE "AffairStatus" ADD VALUE IF NOT EXISTS 'CONDAMNATION_EN_APPEL';
