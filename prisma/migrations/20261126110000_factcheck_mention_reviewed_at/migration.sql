-- A fact-check mention matched on a last name alone ("Gérard", "Leclerc") is a weak signal: it now
-- waits for an admin validation before it counts as an indexation signal for the politician.
-- Nullable, no default, no backfill: a mention matched on a full name needs no review, and no
-- single-word mention has been validated yet. Adding a nullable column is a metadata-only change.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "FactCheckMention" ADD COLUMN "reviewedAt" TIMESTAMP(3);

COMMIT;
