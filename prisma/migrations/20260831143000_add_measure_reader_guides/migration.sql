CREATE TYPE "MeasureReaderGuideSourceKind" AS ENUM ('OFFICIAL_INSTITUTION', 'PROGRAM_SOURCE');
CREATE TYPE "MeasureReaderGuideMentionStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'REJECTED');

CREATE TABLE "MeasureReaderGuide" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceKind" "MeasureReaderGuideSourceKind" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "sourcePublisher" TEXT NOT NULL,
    "sourceRevisionId" TEXT,
    "publicationStatus" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeasureReaderGuide_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeasureRevisionReaderGuide" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "guideId" TEXT,
    "term" TEXT NOT NULL,
    "normalizedTerm" TEXT NOT NULL,
    "evidenceSpan" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "MeasureReaderGuideMentionStatus" NOT NULL DEFAULT 'SUGGESTED',
    "method" TEXT NOT NULL,
    "detectorVersion" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "MeasureRevisionReaderGuide_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeasureReaderGuide_slug_key" ON "MeasureReaderGuide"("slug");
CREATE INDEX "MeasureReaderGuide_publicationStatus_active_idx" ON "MeasureReaderGuide"("publicationStatus", "active");
CREATE UNIQUE INDEX "MeasureRevisionReaderGuide_revisionId_normalizedTerm_key" ON "MeasureRevisionReaderGuide"("revisionId", "normalizedTerm");
CREATE INDEX "MeasureRevisionReaderGuide_revisionId_status_idx" ON "MeasureRevisionReaderGuide"("revisionId", "status");
CREATE INDEX "MeasureRevisionReaderGuide_guideId_status_idx" ON "MeasureRevisionReaderGuide"("guideId", "status");

ALTER TABLE "MeasureReaderGuide" ADD CONSTRAINT "MeasureReaderGuide_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "MeasureRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeasureRevisionReaderGuide" ADD CONSTRAINT "MeasureRevisionReaderGuide_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "MeasureRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeasureRevisionReaderGuide" ADD CONSTRAINT "MeasureRevisionReaderGuide_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "MeasureReaderGuide"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MeasureReaderGuide" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeasureRevisionReaderGuide" ENABLE ROW LEVEL SECURITY;
