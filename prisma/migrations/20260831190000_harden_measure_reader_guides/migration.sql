CREATE TABLE "MeasureReaderGuideDetectionRun" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "detectorVersion" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeasureReaderGuideDetectionRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeasureReaderGuideDetectionRun_revisionId_detectorVersion_key"
    ON "MeasureReaderGuideDetectionRun"("revisionId", "detectorVersion");
CREATE INDEX "MeasureReaderGuideDetectionRun_detectorVersion_completedAt_idx"
    ON "MeasureReaderGuideDetectionRun"("detectorVersion", "completedAt");

-- A revision can expose a reusable guide only once, even if two detected aliases are approved
-- concurrently. Prisma cannot represent a partial unique index, so this invariant lives here.
CREATE UNIQUE INDEX "MeasureRevisionReaderGuide_one_approved_guide_per_revision_key"
    ON "MeasureRevisionReaderGuide"("revisionId", "guideId")
    WHERE "status" = 'APPROVED' AND "guideId" IS NOT NULL;

ALTER TABLE "MeasureReaderGuideDetectionRun"
    ADD CONSTRAINT "MeasureReaderGuideDetectionRun_revisionId_fkey"
    FOREIGN KEY ("revisionId") REFERENCES "MeasureRevision"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeasureReaderGuideDetectionRun" ENABLE ROW LEVEL SECURITY;
