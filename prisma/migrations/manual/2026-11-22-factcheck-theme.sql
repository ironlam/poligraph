-- Fact-checks enrichis, lot 4a : thème d'un fact-check, pour rapprocher la déclaration des votes
-- de son auteur sur les scrutins du même thème (bloc « Ce qu'il vote sur ce thème », lot 4c).
--
-- Trois colonnes nullables, sans valeur par défaut : PostgreSQL les ajoute sans réécrire la table.
--   "theme"             : le thème, parmi les valeurs que portent les scrutins ; nul = aucun thème.
--   "themeClassifiedAt" : date du classement par le modèle ; nul = jamais classé.
--   "themeReviewedAt"   : date de validation dans l'admin ; nul = proposition du modèle seulement.
-- Aucune ligne existante ne change : les trois colonnes partent vides.
--
-- NON APPLIQUÉE. À relire avant application :
--   npx prisma db execute --file prisma/migrations/manual/2026-11-22-factcheck-theme.sql
-- (utilise DIRECT_URL). Le code déclare ces colonnes : appliquer ce fichier AVANT de déployer.

ALTER TABLE "FactCheck"
  ADD COLUMN IF NOT EXISTS "theme" "ThemeCategory",
  ADD COLUMN IF NOT EXISTS "themeClassifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "themeReviewedAt" TIMESTAMP(3);
