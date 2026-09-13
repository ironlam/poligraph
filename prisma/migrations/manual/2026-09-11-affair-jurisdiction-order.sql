-- Ordre de juridiction d'une affaire (axe séparé des stades de procédure).
--
-- Appliqué à la main plutôt que par db:push, bien que le garde de dérive ne
-- bloque pas : le diff complet contient toujours
-- DROP INDEX "SearchEmbedding_embedding_hnsw_idx", que Prisma ne sait pas
-- déclarer. « Toléré » veut dire « ne bloque pas le garde », pas « sans
-- conséquence » : un db:push supprimerait cet index de recherche vectorielle
-- sans que rien ne le signale.
--
-- Pas de bloc DO pour rendre le CREATE TYPE idempotent : SEC-06 les interdit
-- dans les migrations, un DO pouvant porter du SQL privilégié que le garde ne
-- peut pas analyser. Conséquence assumée, et plutôt saine : rejoué, le CREATE
-- TYPE échoue bruyamment au lieu qu'un EXCEPTION WHEN duplicate_object avale
-- l'erreur. L'ALTER TABLE, lui, reste idempotent.
--
-- Déjà appliqué en production. Les affaires existantes prennent le défaut
-- PENAL, ce qui est exact : toutes en relevaient à ce jour.

CREATE TYPE "JurisdictionOrder" AS ENUM ('PENAL', 'FINANCIER', 'ADMINISTRATIF');

ALTER TABLE "Affair"
  ADD COLUMN IF NOT EXISTS "jurisdictionOrder" "JurisdictionOrder" NOT NULL DEFAULT 'PENAL';
