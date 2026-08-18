-- CreateEnum
CREATE TYPE "MeasureReviewReadiness" AS ENUM ('READY_FOR_REVIEW', 'REVIEW_WITH_WARNING');

-- CreateEnum
CREATE TYPE "MeasureReviewWarning" AS ENUM (
  'POSSIBLE_DIAGNOSIS_AS_ACTION',
  'POSSIBLE_EXISTING_POLICY',
  'ATTRIBUTION_UNCERTAIN',
  'POSSIBLE_DUPLICATE',
  'OBJECTIVE_VS_MEASURE_UNCERTAIN',
  'WORDING_NEEDS_REVIEW',
  'EVIDENCE_SCOPE_WEAK',
  'MODEL_LOW_CONFIDENCE'
);

-- CreateEnum
CREATE TYPE "MeasureRejectionReason" AS ENUM (
  'NOT_A_PROPOSAL',
  'DIAGNOSIS_ONLY',
  'THIRD_PARTY',
  'EXISTING_POLICY',
  'HISTORICAL',
  'DUPLICATE',
  'INSUFFICIENT_EVIDENCE',
  'BAD_WORDING',
  'OTHER'
);

-- AlterTable
ALTER TABLE "MeasureRevision"
ADD COLUMN "importFingerprint" TEXT,
ADD COLUMN "reviewReadiness" "MeasureReviewReadiness",
ADD COLUMN "reviewWarnings" "MeasureReviewWarning"[] NOT NULL DEFAULT ARRAY[]::"MeasureReviewWarning"[],
ADD COLUMN "rejectedAt" TIMESTAMP(3),
ADD COLUMN "rejectedBy" TEXT,
ADD COLUMN "rejectionReason" "MeasureRejectionReason",
ADD COLUMN "rejectionDetail" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MeasureRevision_importFingerprint_key"
ON "MeasureRevision"("importFingerprint");

-- AddConstraint
ALTER TABLE "MeasureRevision"
ADD CONSTRAINT "MeasureRevision_rejection_complete_check"
CHECK (
  ("rejectedAt" IS NULL AND "rejectedBy" IS NULL AND "rejectionReason" IS NULL AND "rejectionDetail" IS NULL)
  OR
  ("rejectedAt" IS NOT NULL AND "rejectedBy" IS NOT NULL AND "rejectionReason" IS NOT NULL)
);

-- AddConstraint
ALTER TABLE "MeasureRevision"
ADD CONSTRAINT "MeasureRevision_review_readiness_warning_check"
CHECK (
  "reviewReadiness" IS NULL
  OR ("reviewReadiness" = 'READY_FOR_REVIEW' AND cardinality("reviewWarnings") = 0)
  OR ("reviewReadiness" = 'REVIEW_WITH_WARNING' AND cardinality("reviewWarnings") > 0)
);
