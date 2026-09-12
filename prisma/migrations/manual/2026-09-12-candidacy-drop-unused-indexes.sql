-- Suppression de deux index de Candidacy qui se paient sans servir.
--
-- Candidacy_electionId_listName_idx : 34 Mo pour 1 seul scan entre le 18 juin
-- et le 12 septembre 2026. Le seul calcul qui pouvait s'y appuyer, le compteur
-- de listes 2020, a été retiré de la page : il comptait des noms de personnes,
-- l'import écrivant `listName: list.listName || candidateName`.
--
-- Candidacy_electoralListId_idx : 8,8 Mo sur une colonne entièrement à NULL.
-- ElectoralList est vide, aucune candidature n'y est liée, et le modèle n'est
-- référencé nulle part dans src/ hors code généré.
--
-- La table portait 512 Mo d'index pour 412 Mo de données, et chaque écriture du
-- sync les entretenait tous.
--
-- CONCURRENTLY : la table est lue par les pages publiques élections. Ne pas
-- envelopper dans une transaction, PostgreSQL le refuse.
--
-- À exécuter APRÈS le déploiement du schéma qui ne déclare plus ces @@index :
-- tant que schema.prisma les déclare, un db:push les recrée.
--
-- Recréation, si une régression de plan l'imposait :
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "Candidacy_electionId_listName_idx"
--     ON "Candidacy" ("electionId", "listName");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "Candidacy_electoralListId_idx"
--     ON "Candidacy" ("electoralListId");

DROP INDEX CONCURRENTLY IF EXISTS "Candidacy_electionId_listName_idx";
DROP INDEX CONCURRENTLY IF EXISTS "Candidacy_electoralListId_idx";
