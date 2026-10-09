-- Statut d'affaire « Plainte déposée » : une plainte est déposée, aucune enquête n'est connue.
-- Additive: the deployed code never reads the value until an affair carries it, so this must run
-- BEFORE the code is deployed and the code must be deployed BEFORE any affair is moved to it.
-- ADD VALUE cannot run inside a transaction block that then uses the value: no BEGIN here.
-- Run with: npx prisma db execute --file prisma/migrations/manual/2026-10-08_affair_status_plainte_deposee.sql
-- Applied: 2026-10-09 (production)

ALTER TYPE "AffairStatus" ADD VALUE IF NOT EXISTS 'PLAINTE_DEPOSEE' BEFORE 'ENQUETE_PRELIMINAIRE';
