-- Candidacy : sièges obtenus par la liste au conseil municipal (municipales 2026).
-- Purement additif : une colonne nullable sans valeur par défaut, donc sans réécriture de la table.
-- À passer AVANT le déploiement du code (base d'abord, code ensuite). Prisma liste toutes les
-- colonnes du modèle dans une requête sans `select` : sans cette colonne, ces requêtes échouent.
--   npx prisma db execute --file prisma/migrations/manual/2026-11-15_candidacy_municipal_seats.sql
-- Puis l'import, qui n'écrit que cette colonne :
--   npm run sync:resultats-csv:sieges:dry        (aperçu, aucune écriture)
--   npm run sync:resultats-csv:sieges            (1er tour)
--   npm run sync:resultats-csv:sieges:t2         (2d tour)
-- Rollback : ALTER TABLE "Candidacy" DROP COLUMN "municipalSeats"; après retrait du champ du schéma.

ALTER TABLE "Candidacy" ADD COLUMN IF NOT EXISTS "municipalSeats" INTEGER;
