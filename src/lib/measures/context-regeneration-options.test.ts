import { describe, expect, it } from "vitest";
import { parseMeasureContextRegenerationOptions } from "./context-regeneration-options";

describe("arguments de régénération des contextes", () => {
  it("accepte les syntaxes avec espaces et signe égal", () => {
    expect(
      parseMeasureContextRegenerationOptions([
        "--from-prompt",
        "measure-context-v8",
        "--election=presidentielle-2027",
        "--scope",
        "all",
        "--limit=100",
        "--dry-run",
      ])
    ).toEqual({
      apply: false,
      dryRun: true,
      electionSlug: "presidentielle-2027",
      fromPromptVersion: "measure-context-v8",
      limit: 100,
      scope: "all",
    });
  });

  it("exige une ancienne version et refuse les modes ambigus", () => {
    expect(() => parseMeasureContextRegenerationOptions([])).toThrow("--from-prompt");
    expect(() =>
      parseMeasureContextRegenerationOptions([
        "--from-prompt=measure-context-v8",
        "--dry-run",
        "--apply",
      ])
    ).toThrow("simultanément");
    expect(() =>
      parseMeasureContextRegenerationOptions(["--from-prompt=measure-context-v9", "--apply"])
    ).toThrow("version courante");
  });
});
