import { describe, expect, it } from "vitest";
import { parseReaderGuideFinalizationOptions } from "./reader-guide-finalization-options";

describe("options CLI de finalisation des repères", () => {
  it("accepte un dry-run borné dans les deux syntaxes", () => {
    expect(
      parseReaderGuideFinalizationOptions([
        "--election=presidentielle-2027",
        "--limit=250",
        "--dry-run",
      ])
    ).toMatchObject({ limit: 250, dryRun: true, apply: false, all: false });
    expect(
      parseReaderGuideFinalizationOptions([
        "--election",
        "presidentielle-2027",
        "--limit",
        "250",
        "--dry-run",
      ])
    ).toMatchObject({ limit: 250, dryRun: true, apply: false, all: false });
  });

  it("exige une confirmation humaine explicite pour tout appliquer", () => {
    expect(() => parseReaderGuideFinalizationOptions(["--all", "--apply"])).toThrow(
      /--confirm-reviewed/
    );
    expect(
      parseReaderGuideFinalizationOptions([
        "--apply",
        "--confirm-reviewed",
        "--report",
        "scripts/.local/report.json",
      ])
    ).toMatchObject({
      all: false,
      apply: true,
      confirmReviewed: true,
      report: "scripts/.local/report.json",
    });
  });

  it("refuse les périmètres et modes ambigus", () => {
    expect(() =>
      parseReaderGuideFinalizationOptions(["--all", "--limit", "10", "--dry-run"])
    ).toThrow(/ne peuvent pas/);
    expect(() => parseReaderGuideFinalizationOptions(["--all", "--dry-run", "--apply"])).toThrow(
      /exactement une/
    );
    expect(() => parseReaderGuideFinalizationOptions(["--dry-run"])).toThrow(/--all/);
    expect(() =>
      parseReaderGuideFinalizationOptions(["--all", "--after", "mention-10", "--dry-run"])
    ).toThrow(/ne peuvent pas/);
    expect(() =>
      parseReaderGuideFinalizationOptions([
        "--all",
        "--apply",
        "--confirm-reviewed",
        "--report",
        "report.json",
      ])
    ).toThrow(/périmètre/);
  });
});
