CREATE TYPE "MeasureSubtopicAssignmentStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'REJECTED');

CREATE TABLE "MeasureSubtopic" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "theme" "ThemeCategory" NOT NULL,
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MeasureSubtopic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeasureRevisionSubtopic" (
  "revisionId" TEXT NOT NULL,
  "subtopicId" TEXT NOT NULL,
  "status" "MeasureSubtopicAssignmentStatus" NOT NULL DEFAULT 'SUGGESTED',
  "confidence" DOUBLE PRECISION,
  "method" TEXT NOT NULL,
  "classifierVersion" TEXT NOT NULL,
  "taxonomyVersion" TEXT NOT NULL,
  "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  CONSTRAINT "MeasureRevisionSubtopic_pkey" PRIMARY KEY ("revisionId", "subtopicId")
);

CREATE UNIQUE INDEX "MeasureSubtopic_slug_key" ON "MeasureSubtopic"("slug");
CREATE INDEX "MeasureSubtopic_theme_active_sortOrder_idx"
ON "MeasureSubtopic"("theme", "active", "sortOrder");
CREATE INDEX "MeasureRevisionSubtopic_subtopicId_status_idx"
ON "MeasureRevisionSubtopic"("subtopicId", "status");
CREATE INDEX "MeasureRevisionSubtopic_revisionId_status_idx"
ON "MeasureRevisionSubtopic"("revisionId", "status");

ALTER TABLE "MeasureRevisionSubtopic"
ADD CONSTRAINT "MeasureRevisionSubtopic_revisionId_fkey"
FOREIGN KEY ("revisionId") REFERENCES "MeasureRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeasureRevisionSubtopic"
ADD CONSTRAINT "MeasureRevisionSubtopic_subtopicId_fkey"
FOREIGN KEY ("subtopicId") REFERENCES "MeasureSubtopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MeasureSubtopic" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeasureRevisionSubtopic" ENABLE ROW LEVEL SECURITY;
