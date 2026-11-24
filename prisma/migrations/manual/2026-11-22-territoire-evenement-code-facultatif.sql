-- Fil du territoire (Territoires v2, lot C) : rapports des chambres régionales des comptes.
--
-- Un rapport dont le titre nomme une commune ambiguë entre en brouillon sans territoire ; une
-- personne le choisit dans l'admin, ou le rejette. Le code devient donc facultatif, mais seulement
-- en brouillon ou rejeté (une notice rejetée n'est jamais affichée) : la contrainte refuse un
-- événement en revue ou publié sans code.
--
-- Aucune ligne existante n'est modifiée : tous les événements en base ont un code, la contrainte
-- les accepte. La politique RLS (lecture `anon` des seules lignes PUBLISHED) est inchangée.
-- NON APPLIQUÉE. À relire avant application, avec une sauvegarde pg_dump :
--   npx prisma db execute --file prisma/migrations/manual/2026-11-22-territoire-evenement-code-facultatif.sql
-- (utilise DIRECT_URL). Le code ne crée aucune ligne sans code avant l'importeur : il peut
-- partir avant ce fichier.

ALTER TABLE "TerritoireEvenement" ALTER COLUMN "territoryCode" DROP NOT NULL;

ALTER TABLE "TerritoireEvenement"
  ADD CONSTRAINT "TerritoireEvenement_territoryCode_hors_brouillon"
  CHECK ("territoryCode" IS NOT NULL OR "status" IN ('DRAFT', 'REJECTED'));
