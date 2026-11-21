-- Comptes de la collectivité (Territoires v2, lot C) : nouvelle valeur COLLECTIVITE de RepereScopeKind.
--
-- Une ligne de comptes mesure une entité comptable, identifiée par son SIREN, qui n'est pas
-- toujours le territoire de la page : la Collectivité européenne d'Alsace porte les comptes du
-- Bas-Rhin et du Haut-Rhin, la Ville de Paris ceux de la commune et du département.
-- Additif : aucune ligne existante ne change.
--
-- NON APPLIQUÉE. À appliquer AVANT la fusion de la PR qui la déclare (le client Prisma généré
-- connaît la valeur, la base doit la connaître aussi) :
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/manual/2026-11-22-repere-scope-collectivite.sql

ALTER TYPE "RepereScopeKind" ADD VALUE IF NOT EXISTS 'COLLECTIVITE';
