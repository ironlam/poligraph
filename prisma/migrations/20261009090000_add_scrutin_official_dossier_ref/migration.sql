-- Preserve the dossier reference carried by the official AN scrutin payload.
-- The public indicator can then fail closed instead of trusting a heuristic link.
ALTER TABLE "Scrutin" ADD COLUMN "officialDossierRef" TEXT;

CREATE INDEX "Scrutin_officialDossierRef_idx" ON "Scrutin"("officialDossierRef");
