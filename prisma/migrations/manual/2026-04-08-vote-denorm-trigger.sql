-- Phase 5b: keep Vote.votingDate and Vote.chamber in sync with Scrutin
-- when an editor updates the parent row. Application code populates both
-- columns on INSERT (via writeVotesForScrutin); this trigger handles the
-- rare UPDATE case.

CREATE OR REPLACE FUNCTION sync_vote_denorm_from_scrutin()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when one of the denormalized columns actually changed
  IF OLD."votingDate" IS DISTINCT FROM NEW."votingDate"
     OR OLD."chamber" IS DISTINCT FROM NEW."chamber" THEN
    UPDATE "Vote"
    SET "votingDate" = NEW."votingDate",
        "chamber"    = NEW."chamber"
    WHERE "scrutinId" = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_vote_denorm_from_scrutin_trigger ON "Scrutin";

CREATE TRIGGER sync_vote_denorm_from_scrutin_trigger
AFTER UPDATE OF "votingDate", "chamber" ON "Scrutin"
FOR EACH ROW
EXECUTE FUNCTION sync_vote_denorm_from_scrutin();
