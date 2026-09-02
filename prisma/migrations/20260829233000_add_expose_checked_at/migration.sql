-- Rotation cursor for sync:legislation:content, mirroring Politician.photoCheckedAt.
--
-- Before this column, the sync queried WHERE exposeDesMotifs IS NULL ordered by
-- filingDate desc with no other cursor: a dossier the AN will never publish (a
-- Senate-originated text, requested against the AN endpoint) stayed at the same
-- priority forever and permanently starved dossiers filed earlier. Stamping every
-- attempt here, successful or not, lets the sync order by "checked longest ago /
-- never checked" and rotate through the whole backlog instead of retrying the
-- same unreachable documents on every run.
ALTER TABLE "LegislativeDossier" ADD COLUMN "exposeCheckedAt" TIMESTAMP(3);

CREATE INDEX "LegislativeDossier_exposeCheckedAt_idx" ON "LegislativeDossier"("exposeCheckedAt");

-- Backfill: every dossier eligible for this sync (documentExternalId set) has
-- already been through the manual catch-up run that motivated this migration —
-- including the ~601 pending ones whose text the AN will never publish (a
-- Senate-originated dossier requested against the AN endpoint). Left NULL, that
-- whole pool would look "never checked" on deploy, and the first bounded runs
-- after this migration would draw a batch of known-dead documents, all
-- classified as first attempts, tripping the all-missing guard as a false
-- positive on a healthy source. Stamping them now means only dossiers created
-- after this migration enter the never-checked queue, which is what the guard
-- is meant to watch.
UPDATE "LegislativeDossier" SET "exposeCheckedAt" = now() WHERE "documentExternalId" IS NOT NULL;
