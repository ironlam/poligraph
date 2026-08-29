-- SOCIAL_TRAVAIL remains the historical broad category used by legislative dossiers and
-- scrutins. Presidential measures use the four more precise categories added here.
-- The application keeps legacy presidential rows readable until the separately audited
-- reclassification batch has emptied SOCIAL_TRAVAIL; this schema migration changes no data.
ALTER TYPE "ThemeCategory" ADD VALUE IF NOT EXISTS 'EMPLOI_TRAVAIL';
ALTER TYPE "ThemeCategory" ADD VALUE IF NOT EXISTS 'RETRAITES';
ALTER TYPE "ThemeCategory" ADD VALUE IF NOT EXISTS 'SOLIDARITES_PROTECTION_SOCIALE';
ALTER TYPE "ThemeCategory" ADD VALUE IF NOT EXISTS 'SOCIETE_DROITS_LIBERTES';
