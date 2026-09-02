import { describe, expect, it } from "vitest";
import { readGeneratedContextClaims } from "@/lib/measures/context-provenance";

describe("preuve des contextes générés", () => {
  it("lit uniquement les associations affirmation-preuves valides", () => {
    expect(
      readGeneratedContextClaims({
        claims: [
          {
            text: "Le document rattache la mesure à ce constat précis.",
            evidenceUnitIds: ["unit-1"],
          },
        ],
        generatedBy: "admin",
      })
    ).toEqual([
      {
        text: "Le document rattache la mesure à ce constat précis.",
        evidenceUnitIds: ["unit-1"],
      },
    ]);
  });

  it("n'expose pas une trace d'audit mal formée", () => {
    expect(
      readGeneratedContextClaims({ claims: [{ text: "Trop court", evidenceUnitIds: [] }] })
    ).toEqual([]);
  });
});
