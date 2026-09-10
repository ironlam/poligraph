-- Suppression de la colonne héritée Mandate."governmentName" (suivi #576).
--
-- Le nom du gouvernement vit dans MandateGovernment depuis que l'extension 1:1
-- a été introduite. La colonne d'origine n'a jamais été supprimée, et le schéma
-- Prisma ne la déclare plus : elle apparaît donc dans chaque diff comme un DROP
-- en attente, ce qui fait échouer db:push et masque les vraies dérives.
--
-- Vérifié avant exécution, sur les 43 003 mandats de production :
--   valeurs non nulles ................. 0
--   lignes sans MandateGovernment ...... 0
--   valeurs divergentes de la relation . 0
-- La colonne est vide, la suppression ne perd aucune donnée.
--
-- Aucun code ne la lit : Prisma ne la déclare pas, donc aucune requête générée
-- ne la sélectionne, et les lectures de `governmentName` dans src/ passent
-- toutes par la relation `governmentData`.

ALTER TABLE "Mandate" DROP COLUMN IF EXISTS "governmentName";
