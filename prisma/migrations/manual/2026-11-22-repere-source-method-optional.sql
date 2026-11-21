-- Comptes de la collectivité (Territoires v2, lot C) : RepereSource.methodSlug devient facultatif.
--
-- Un jeu OFGL (communes, départements ou régions) alimente cinq pages de méthode : la source n'en
-- désigne plus une seule, c'est la configuration de chaque indicateur qui nomme sa page.
-- Aucune ligne existante ne change (les sources déjà créées gardent leur slug).
--
-- NON APPLIQUÉE. À relire avant application :
--   npx prisma db execute --file prisma/migrations/manual/2026-11-22-repere-source-method-optional.sql
-- (utilise DIRECT_URL). Le code lit déjà un slug nul : il peut partir avant ou après ce fichier.

ALTER TABLE "RepereSource" ALTER COLUMN "methodSlug" DROP NOT NULL;
