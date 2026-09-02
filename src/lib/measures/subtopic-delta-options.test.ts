import { describe, expect, it } from "vitest";
import { parseSubtopicDeltaCLIOptions } from "@/lib/measures/subtopic-delta-options";

describe("arguments du workflow différentiel", () => {
  it("accepte un dry-run cursorisé dans les deux syntaxes", () => {
    expect(
      parseSubtopicDeltaCLIOptions([
        "--subtopic",
        "racisme-antisemitisme",
        "--election=presidentielle-2027",
        "--limit",
        "100",
        "--after=measure-1",
        "--dry-run",
      ])
    ).toEqual({
      mode: "dry-run",
      subtopicSlug: "racisme-antisemitisme",
      electionSlug: "presidentielle-2027",
      limit: 100,
      after: "measure-1",
    });
  });

  it("accepte seulement un rapport contrôlé en mode apply", () => {
    expect(
      parseSubtopicDeltaCLIOptions(["--apply", "--report=.tmp/measure-subtopic-delta/run-1.json"])
    ).toEqual({
      mode: "apply",
      reportPath: ".tmp/measure-subtopic-delta/run-1.json",
    });
  });

  it("refuse les modes et paramètres incohérents", () => {
    expect(() =>
      parseSubtopicDeltaCLIOptions([
        "--dry-run",
        "--apply",
        "--subtopic=racisme-antisemitisme",
        "--report=report.json",
      ])
    ).toThrow("exactement un mode");
    expect(() => parseSubtopicDeltaCLIOptions(["--apply"])).toThrow("--report");
    expect(() => parseSubtopicDeltaCLIOptions(["--dry-run"])).toThrow("--subtopic");
  });
});
