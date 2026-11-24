-- Candidacy.statusChangedAt: when the editorial status last took a different value.
-- Run with: npx prisma db execute --file prisma/migrations/manual/add_candidacy_status_changed_at.sql
-- Must run BEFORE deploying the code that selects the column.

ALTER TABLE "Candidacy" ADD COLUMN IF NOT EXISTS "statusChangedAt" TIMESTAMP(3);

-- Backfill from the audit trail of the admin action: the latest entry where the status really
-- changed, kept only when it still matches the status the row holds today.
UPDATE "Candidacy" c
SET "statusChangedAt" = a."createdAt"
FROM (
  SELECT DISTINCT ON ("entityId") "entityId", "createdAt", changes->>'status' AS status
  FROM "AuditLog"
  WHERE "entityType" = 'Candidacy'
    AND action = 'UPDATE'
    AND changes->>'status' IS NOT NULL
    AND changes ? 'previousStatus'
    AND changes->>'status' IS DISTINCT FROM changes->>'previousStatus'
  ORDER BY "entityId", "createdAt" DESC
) a
WHERE c.id = a."entityId"
  AND c.status::text = a.status
  AND c."statusChangedAt" IS NULL;
