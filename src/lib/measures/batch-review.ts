import { MeasureValidationError } from "@/lib/measures/errors";
import { reviewMeasureRevision } from "@/lib/measures/transitions";
import type { MeasureBatchKind } from "@/lib/measures/batch-kind";

/**
 * A human must be able to inspect the complete batch before confirming it. Keeping the same
 * ceiling as publication also makes the two steps line up in the moderation interface.
 */
export const MAX_MEASURE_REVIEW_BATCH_SIZE = 100;

export type MeasureReviewBatchItem = {
  measureId: string;
  revisionId: string;
  batchKind: MeasureBatchKind;
};

export type MeasureReviewBatchFailure = MeasureReviewBatchItem & {
  message: string;
};

export type MeasureReviewBatchResult = {
  reviewedCount: number;
  failures: MeasureReviewBatchFailure[];
};

function assertValidBatch(items: MeasureReviewBatchItem[]): void {
  if (items.length === 0) {
    throw new MeasureValidationError("Le lot de relecture est vide");
  }
  if (items.length > MAX_MEASURE_REVIEW_BATCH_SIZE) {
    throw new MeasureValidationError(
      `Un lot ne peut pas dépasser ${MAX_MEASURE_REVIEW_BATCH_SIZE} mesures`
    );
  }

  const measureIds = new Set<string>();
  const revisionIds = new Set<string>();
  for (const item of items) {
    if (item.measureId.trim() === "" || item.revisionId.trim() === "") {
      throw new MeasureValidationError(
        "Chaque élément du lot doit identifier une mesure et une révision"
      );
    }
    if (measureIds.has(item.measureId) || revisionIds.has(item.revisionId)) {
      throw new MeasureValidationError(
        "Une mesure ou une révision apparaît plusieurs fois dans le lot"
      );
    }
    measureIds.add(item.measureId);
    revisionIds.add(item.revisionId);
  }
}

/**
 * Runs every item through the ordinary review transition. This preserves the lock, source,
 * active-draft and audit checks on each revision instead of recreating them in a bulk update.
 */
export async function reviewMeasureRevisionBatch(
  items: MeasureReviewBatchItem[],
  reviewedBy: string
): Promise<MeasureReviewBatchResult> {
  assertValidBatch(items);

  let reviewedCount = 0;
  const failures: MeasureReviewBatchFailure[] = [];

  for (const item of items) {
    try {
      await reviewMeasureRevision({ ...item, reviewedBy });
      reviewedCount += 1;
    } catch (error) {
      if (error instanceof MeasureValidationError) {
        failures.push({ ...item, message: error.message });
        continue;
      }
      throw error;
    }
  }

  return { reviewedCount, failures };
}
