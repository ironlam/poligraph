import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeasureValidationError } from "@/lib/measures/errors";

const { reviewMeasureRevisionMock } = vi.hoisted(() => ({
  reviewMeasureRevisionMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/measures/transitions", () => ({
  reviewMeasureRevision: reviewMeasureRevisionMock,
}));

import { MAX_MEASURE_REVIEW_BATCH_SIZE, reviewMeasureRevisionBatch } from "../batch-review";

const item = (number: number) => ({
  measureId: `measure-${number}`,
  revisionId: `revision-${number}`,
  batchKind: "FIRST_PUBLICATION" as const,
});

describe("reviewMeasureRevisionBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passe chaque élément par la transition ordinaire avec l'acteur", async () => {
    const result = await reviewMeasureRevisionBatch([item(1), item(2)], "admin");

    expect(result).toEqual({ reviewedCount: 2, failures: [] });
    expect(reviewMeasureRevisionMock).toHaveBeenNthCalledWith(1, {
      ...item(1),
      reviewedBy: "admin",
    });
    expect(reviewMeasureRevisionMock).toHaveBeenNthCalledWith(2, {
      ...item(2),
      reviewedBy: "admin",
    });
  });

  it("continue après un refus métier et restitue le résultat exact", async () => {
    reviewMeasureRevisionMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new MeasureValidationError("Brouillon remplacé"));

    const result = await reviewMeasureRevisionBatch([item(1), item(2)], "admin");

    expect(result).toEqual({
      reviewedCount: 1,
      failures: [{ ...item(2), message: "Brouillon remplacé" }],
    });
  });

  it("valide tout le lot avant la première écriture", async () => {
    await expect(
      reviewMeasureRevisionBatch([item(1), { ...item(2), measureId: "measure-1" }], "admin")
    ).rejects.toThrow(/plusieurs fois/i);
    await expect(reviewMeasureRevisionBatch([], "admin")).rejects.toThrow(/vide/i);
    await expect(
      reviewMeasureRevisionBatch(
        Array.from({ length: MAX_MEASURE_REVIEW_BATCH_SIZE + 1 }, (_, index) => ({
          measureId: `measure-${index}`,
          revisionId: `revision-${index}`,
          batchKind: "FIRST_PUBLICATION" as const,
        })),
        "admin"
      )
    ).rejects.toThrow(/dépasser/i);

    expect(reviewMeasureRevisionMock).not.toHaveBeenCalled();
  });

  it("ne transforme pas une panne inattendue en refus éditorial", async () => {
    reviewMeasureRevisionMock.mockRejectedValueOnce(new Error("connection terminated"));

    await expect(reviewMeasureRevisionBatch([item(1)], "admin")).rejects.toThrow(
      "connection terminated"
    );
  });
});
