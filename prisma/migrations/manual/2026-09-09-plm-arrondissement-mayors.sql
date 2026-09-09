-- Maires d'arrondissement PLM (issue #587).
--
-- Appliqué à la main plutôt que par db:push : le diff complet embarque une
-- dérive préexistante et sans rapport (ALTER TABLE "Mandate" DROP COLUMN
-- "governmentName", suivi sur #576), et un ajout d'enum ne doit pas servir de
-- véhicule à une suppression de colonne.
--
-- Les deux opérations sont additives et idempotentes : aucune donnée existante
-- n'est lue ni réécrite.

-- Un maire d'arrondissement ne dirige pas une commune. Le confondre avec MAIRE
-- gonflerait les compteurs publics et la population ciblée par la découverte web.
ALTER TYPE "MandateType" ADD VALUE IF NOT EXISTS 'MAIRE_ARRONDISSEMENT';

-- Le RNE rattache ces élus à la commune-mère (75056, 69123, 13055) plus un
-- libellé de secteur. Les secteurs ne correspondent pas aux arrondissements
-- INSEE : Paris Centre en fusionne quatre, Marseille élit huit maires pour
-- seize arrondissements.
ALTER TABLE "MandateLocal" ADD COLUMN IF NOT EXISTS "sectorLabel" TEXT;
