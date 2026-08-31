import { MeasureConcurrencyError, MeasureValidationError } from "@/lib/measures/errors";
import { publishMeasureRevision } from "@/lib/measures/transitions";
import type { MeasureBatchKind } from "@/lib/measures/batch-kind";

/**
 * A bounded batch keeps one explicit human decision manageable and prevents an authenticated
 * request from turning into an unbounded write loop. Larger editions are exposed in successive
 * batches by the admin query.
 */
export const MAX_MEASURE_PUBLICATION_BATCH_SIZE = 100;

export type MeasurePublicationBatchItem = {
  measureId: string;
  revisionId: string;
  expectedUpdatedAt: Date;
  batchKind: MeasureBatchKind;
};

export type MeasurePublicationBatchFailure = {
  measureId: string;
  revisionId: string;
  message: string;
  stale: boolean;
};

export type MeasurePublicationBatchResult = {
  publishedCount: number;
  failures: MeasurePublicationBatchFailure[];
};

function assertValidBatch(items: MeasurePublicationBatchItem[]): void {
  if (items.length === 0) {
    throw new MeasureValidationError("Le lot de publication est vide");
  }
  if (items.length > MAX_MEASURE_PUBLICATION_BATCH_SIZE) {
    throw new MeasureValidationError(
      `Un lot ne peut pas dépasser ${MAX_MEASURE_PUBLICATION_BATCH_SIZE} mesures`
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
    if (Number.isNaN(item.expectedUpdatedAt.getTime())) {
      throw new MeasureValidationError("Chaque élément du lot doit porter une version valide");
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
 * Publishes each reviewed revision through the ordinary transition. This is intentionally an
 * orchestration layer, not a bulk Prisma update: every revision still gets its source, evidence,
 * pointer and optimistic-concurrency checks.
 *
 * Domain refusals are collected so one stale row does not hide the outcome of the other rows.
 * Unexpected infrastructure errors are rethrown because they are not editorial results.
 */
export async function publishMeasureRevisionBatch(
  items: MeasurePublicationBatchItem[],
  publishedBy: string
): Promise<MeasurePublicationBatchResult> {
  assertValidBatch(items);

  let publishedCount = 0;
  const failures: MeasurePublicationBatchFailure[] = [];

  for (const item of items) {
    try {
      await publishMeasureRevision({ ...item, publishedBy });
      publishedCount += 1;
    } catch (error) {
      if (error instanceof MeasureConcurrencyError || error instanceof MeasureValidationError) {
        failures.push({
          measureId: item.measureId,
          revisionId: item.revisionId,
          message: error.message,
          stale: error instanceof MeasureConcurrencyError,
        });
        continue;
      }
      throw error;
    }
  }

  return { publishedCount, failures };
}
