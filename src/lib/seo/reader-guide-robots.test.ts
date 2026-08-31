import { describe, expect, it } from "vitest";
import { isIndexableReaderGuide, MIN_READER_GUIDE_DEFINITION_LENGTH } from "./reader-guide-robots";

const valid = {
  active: true,
  published: true,
  reviewedAt: new Date("2027-01-01T00:00:00Z"),
  sourceUrl: "https://www.ecologie.gouv.fr/zfe",
  definition: "D".repeat(MIN_READER_GUIDE_DEFINITION_LENGTH),
  publicMeasureCount: 1,
};

describe("indexation des repères citoyens", () => {
  it("indexe une définition sourcée et réellement employée dans le corpus public", () => {
    expect(isIndexableReaderGuide(valid)).toBe(true);
  });

  it("refuse une page sans mesure publique ou avec une définition trop courte", () => {
    expect(isIndexableReaderGuide({ ...valid, publicMeasureCount: 0 })).toBe(false);
    expect(
      isIndexableReaderGuide({
        ...valid,
        definition: "D".repeat(MIN_READER_GUIDE_DEFINITION_LENGTH - 1),
      })
    ).toBe(false);
  });
});
