ALTER TABLE "AffairEvent" ADD COLUMN "identityKey" TEXT;

CREATE UNIQUE INDEX "AffairEvent_affairId_identityKey_key"
ON "AffairEvent"("affairId", "identityKey");
