import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeasureConcurrencyError, MeasureValidationError } from "@/lib/measures/errors";

const { publishMeasureRevisionMock } = vi.hoisted(() => ({
  publishMeasureRevisionMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/measures/transitions", () => ({
  publishMeasureRevision: publishMeasureRevisionMock,
}));

import {
  MAX_MEASURE_PUBLICATION_BATCH_SIZE,
  publishMeasureRevisionBatch,
} from "../batch-publication";

const item = (number: number) => ({
  measureId: `measure-${number}`,
  revisionId: `revision-${number}`,
  batchKind: "FIRST_PUBLICATION" as const,
  expectedUpdatedAt: new Date(`2027-01-${String(number).padStart(2, "0")}T10:00:00.000Z`),
});

describe("publishMeasureRevisionBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passe chaque élément par la transition ordinaire avec l'acteur", async () => {
    const result = await publishMeasureRevisionBatch([item(1), item(2)], "admin");

    expect(result).toEqual({ publishedCount: 2, failures: [] });
    expect(publishMeasureRevisionMock).toHaveBeenNthCalledWith(1, {
      ...item(1),
      publishedBy: "admin",
    });
    expect(publishMeasureRevisionMock).toHaveBeenNthCalledWith(2, {
      ...item(2),
      publishedBy: "admin",
    });
  });

  it("continue après un refus métier et restitue le résultat exact", async () => {
    publishMeasureRevisionMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new MeasureValidationError("Preuve invalide"))
      .mockRejectedValueOnce(
        new MeasureConcurrencyError("measure-3", item(3).expectedUpdatedAt, new Date())
      );

    const result = await publishMeasureRevisionBatch([item(1), item(2), item(3)], "admin");

    expect(result.publishedCount).toBe(1);
    expect(result.failures).toEqual([
      expect.objectContaining({ measureId: "measure-2", message: "Preuve invalide", stale: false }),
      expect.objectContaining({ measureId: "measure-3", stale: true }),
    ]);
  });

  it("valide tout le lot avant la première écriture", async () => {
    await expect(
      publishMeasureRevisionBatch([item(1), { ...item(2), measureId: "measure-1" }], "admin")
    ).rejects.toThrow(/plusieurs fois/i);
    await expect(publishMeasureRevisionBatch([], "admin")).rejects.toThrow(/vide/i);
    await expect(
      publishMeasureRevisionBatch(
        Array.from({ length: MAX_MEASURE_PUBLICATION_BATCH_SIZE + 1 }, (_, index) =>
          item((index % 28) + 1)
        ),
        "admin"
      )
    ).rejects.toThrow(/dépasser/i);

    expect(publishMeasureRevisionMock).not.toHaveBeenCalled();
  });

  it("ne transforme pas une panne inattendue en refus éditorial", async () => {
    publishMeasureRevisionMock.mockRejectedValueOnce(new Error("connection terminated"));

    await expect(publishMeasureRevisionBatch([item(1)], "admin")).rejects.toThrow(
      "connection terminated"
    );
  });
});
