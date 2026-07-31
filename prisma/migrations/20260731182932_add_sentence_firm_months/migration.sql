-- Firm part of a prison term and of an ineligibility (#576).
--
-- Nullable on purpose: null means "not established", which is distinct from 0
-- ("entirely suspended"). The boolean prisonSuspended these replace could not hold that
-- difference, and every read site resolved the missing case to "ferme".
--
-- Expand step: prisonSuspended stays until the switch is verified in production.
ALTER TABLE "Affair" ADD COLUMN     "ineligibilityFirmMonths" INTEGER,
ADD COLUMN     "prisonFirmMonths" INTEGER;
