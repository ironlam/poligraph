-- Sénat : un scrutin peut être COMPLETE avec une ligne de moins que le décompte officiel
-- quand c'est le président qui manque dans le JSON nominatif (raison explicite obligatoire).
-- À exécuter avec : npx prisma db execute --file prisma/migrations/manual/relax-scrutin-vote-import-complete-check.sql
-- Les lignes existantes respectent déjà l'ancienne contrainte, donc aussi la nouvelle.
-- COALESCE : sans lui, une raison nulle donne NULL et un CHECK à NULL passe.

BEGIN;

ALTER TABLE "ScrutinVoteImport" DROP CONSTRAINT "ScrutinVoteImport_complete_check";

ALTER TABLE "ScrutinVoteImport" ADD CONSTRAINT "ScrutinVoteImport_complete_check" CHECK (
  "status" <> 'COMPLETE'
  OR ("observedCount" = "expectedCount" AND "statusReason" IS NULL)
  OR ("observedCount" = "expectedCount" - 1 AND COALESCE("statusReason", '') = 'president_row_missing')
);

COMMIT;
