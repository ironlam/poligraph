-- Index de couverture sur Candidacy.partyId.
--
-- partyId était la seule clé étrangère de Candidacy sans index couvrant :
-- tout JOIN ou filtre sur le parti dégénérait en seq scan sur la table
-- entière (~1,3 M de lignes, les municipales représentant l'essentiel du
-- volume). Le linter de performance de la base le remontait explicitement.
--
-- Les autres FK de la table (politicianId, candidateId, communeId,
-- electoralListId) ont déjà leur index simple ; celui-ci complète la série.
--
-- CONCURRENTLY : la table est lue par les pages publiques élections, on ne
-- peut pas poser un verrou d'écriture le temps de la construction.
--
-- Fichier plat dans manual/ et non dossier versionné : la prod n'a pas de
-- table _prisma_migrations, et staging-migrate.yml lance `migrate deploy` sur
-- tout push touchant prisma/**. Un dossier versionné armerait ce workflow
-- avec un historique qu'il ne peut pas rejouer. Le @@index correspondant est
-- déclaré dans schema.prisma pour que db:push le conserve.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Candidacy_partyId_idx"
  ON "Candidacy" ("partyId");
