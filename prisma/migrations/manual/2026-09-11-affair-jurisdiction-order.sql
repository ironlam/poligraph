-- Ordre de juridiction d'une affaire (axe séparé des stades de procédure).
--
-- Appliqué à la main plutôt que par db:push, bien que le garde de dérive ne
-- bloque pas : le diff complet contient toujours
-- DROP INDEX "SearchEmbedding_embedding_hnsw_idx", que Prisma ne sait pas
-- déclarer. « Toléré » veut dire « ne bloque pas le garde », pas « sans
-- conséquence » : un db:push supprimerait cet index de recherche vectorielle
-- sans que rien ne le signale.
--
-- Additif et idempotent. La colonne porte un défaut, donc les affaires
-- existantes deviennent PENAL, ce qui est exact : toutes en relèvent à ce jour.

DO $do$
BEGIN
  CREATE TYPE "JurisdictionOrder" AS ENUM ('PENAL', 'FINANCIER', 'ADMINISTRATIF');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$do$;

ALTER TABLE "Affair"
  ADD COLUMN IF NOT EXISTS "jurisdictionOrder" "JurisdictionOrder" NOT NULL DEFAULT 'PENAL';
