-- Public changelog entries. Drafts stay private until an admin publishes them.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TYPE "ChangelogType" AS ENUM ('NOUVEAUTE', 'AMELIORATION', 'CORRECTION', 'DONNEES');

CREATE TABLE "ChangelogEntry" (
    "id" TEXT NOT NULL,
    "type" "ChangelogType" NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChangelogEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChangelogEntry_status_date_idx" ON "ChangelogEntry"("status", "date" DESC);

-- SEC-03: public access goes through the application, which filters publication
-- status. Direct Data API access must not expose drafts.
ALTER TABLE "ChangelogEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ChangelogEntry" FROM PUBLIC, anon, authenticated;

COMMIT;
