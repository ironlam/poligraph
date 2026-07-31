-- Firm part of a prison term and of an ineligibility (#576).
--
-- Documentation only, applied via `npm run db:push`. This database has no
-- `_prisma_migrations` table (verified 2026-07-31), so `prisma migrate deploy` is never
-- run against it and a versioned migration directory here would only arm the staging
-- workflow with a history it cannot replay.
--
-- Nullable on purpose: null means "not established", which is distinct from 0
-- ("entirely suspended"). The boolean prisonSuspended these replace could not hold that
-- difference, and every read site resolved the missing case to "ferme".
--
-- Expand step: prisonSuspended stays until the switch is verified in production.
ALTER TABLE "Affair" ADD COLUMN     "ineligibilityFirmMonths" INTEGER,
ADD COLUMN     "prisonFirmMonths" INTEGER;
