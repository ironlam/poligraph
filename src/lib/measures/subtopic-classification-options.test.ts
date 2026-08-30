import { describe, expect, it } from "vitest";
import { parseMeasureSubtopicClassificationOptions } from "@/lib/measures/subtopic-classification-options";

describe("arguments du classificateur de sous-thèmes", () => {
  it("accepte la syntaxe avec espaces", () => {
    expect(
      parseMeasureSubtopicClassificationOptions([
        "--limit",
        "500",
        "--election",
        "presidentielle-2027",
        "--candidate",
        "alice-dupont",
        "--dry-run",
      ])
    ).toEqual({
      limit: 500,
      electionSlug: "presidentielle-2027",
      candidateSlug: "alice-dupont",
      dryRun: true,
      force: false,
    });
  });

  it("accepte la syntaxe avec signe égal et les booléens explicites", () => {
    expect(
      parseMeasureSubtopicClassificationOptions([
        "--limit=500",
        "--election=presidentielle-2027",
        "--dry-run=false",
        "--force=true",
      ])
    ).toEqual({
      limit: 500,
      electionSlug: "presidentielle-2027",
      dryRun: false,
      force: true,
    });
  });

  it("refuse les options inconnues, dupliquées ou invalides", () => {
    expect(() => parseMeasureSubtopicClassificationOptions(["--unknown"])).toThrow(
      "Option inconnue"
    );
    expect(() =>
      parseMeasureSubtopicClassificationOptions(["--limit=10", "--limit", "20"])
    ).toThrow("Option dupliquée");
    expect(() => parseMeasureSubtopicClassificationOptions(["--limit=0"])).toThrow("--limit");
  });
});
