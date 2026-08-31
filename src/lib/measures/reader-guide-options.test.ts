import { describe, expect, it } from "vitest";
import { parseReaderGuideDetectionOptions } from "./reader-guide-options";

describe("options CLI de détection des repères", () => {
  it("accepte les syntaxes séparée et avec signe égal", () => {
    expect(
      parseReaderGuideDetectionOptions([
        "--election",
        "presidentielle-2027",
        "--limit=100",
        "--after",
        "measure-1",
        "--dry-run",
      ])
    ).toMatchObject({
      electionSlug: "presidentielle-2027",
      limit: 100,
      after: "measure-1",
      dryRun: true,
      apply: false,
    });
  });

  it("refuse un mode ambigu ou absent", () => {
    expect(() => parseReaderGuideDetectionOptions([])).toThrow(/exactement une/);
    expect(() => parseReaderGuideDetectionOptions(["--apply", "--dry-run"])).toThrow(
      /exactement une/
    );
  });
});
