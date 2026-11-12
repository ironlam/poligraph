-- Presidency of a parliamentary group, one row per function period published by the chamber
-- (Assemblée nationale: AMO10 mandates of quality "Président"; Sénat: ODSEN_HISTOGROUPES).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE "ParliamentaryGroupPresidency" (
    "id" TEXT NOT NULL,
    "parliamentaryGroupId" TEXT NOT NULL,
    "politicianId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "source" "DataSource" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "lastConfirmedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ParliamentaryGroupPresidency_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ParliamentaryGroupPresidency_parliamentaryGroupId_fkey" FOREIGN KEY ("parliamentaryGroupId") REFERENCES "ParliamentaryGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ParliamentaryGroupPresidency_politicianId_fkey" FOREIGN KEY ("politicianId") REFERENCES "Politician"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ParliamentaryGroupPresidency_source_externalId_key" ON "ParliamentaryGroupPresidency"("source", "externalId");
CREATE INDEX "ParliamentaryGroupPresidency_parliamentaryGroupId_endDate_idx" ON "ParliamentaryGroupPresidency"("parliamentaryGroupId", "endDate");
CREATE INDEX "ParliamentaryGroupPresidency_politicianId_idx" ON "ParliamentaryGroupPresidency"("politicianId");

-- SEC-03: public access goes through the application, which filters the person's publication
-- status. Direct Data API access must not bypass that filter.
ALTER TABLE "ParliamentaryGroupPresidency" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ParliamentaryGroupPresidency" FROM PUBLIC, anon, authenticated;

COMMIT;
