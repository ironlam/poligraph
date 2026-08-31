import { describe, expect, it } from "vitest";
import { parseMeasureContextGenerationOptions } from "./context-generation-options";

describe("arguments de génération des contextes", () => {
  it("conserve le lot borné par défaut", () => {
    expect(parseMeasureContextGenerationOptions([])).toEqual({
      all: false,
      apply: false,
      electionSlug: "presidentielle-2027",
      limit: 30,
    });
  });

  it("accepte un traitement complet explicite", () => {
    expect(
      parseMeasureContextGenerationOptions(["--election=presidentielle-2027", "--all", "--apply"])
    ).toEqual({
      all: true,
      apply: true,
      electionSlug: "presidentielle-2027",
      limit: 30,
    });
  });

  it("refuse de combiner le traitement complet et une limite", () => {
    expect(() => parseMeasureContextGenerationOptions(["--all", "--limit=100"])).toThrow(
      "simultanément"
    );
  });
});
