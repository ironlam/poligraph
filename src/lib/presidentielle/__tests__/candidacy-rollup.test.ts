import { describe, expect, it } from "vitest";
import { resolveProgrammeAbsence, rollupMeasuresByCandidacy } from "../candidacy-rollup";

describe("rollupMeasuresByCandidacy", () => {
  it("ne compte pas une mesure portée par une candidature que rien ne rend publiquement", () => {
    // Invariant I7, déjà tenu par `loadThemesIndex` : une mesure rattachée à une candidature dont
    // l'extension est encore DRAFT n'apparaît sur aucune page sujet et sur aucune fiche. La compter
    // ici annoncerait « 2 mesures dépouillées » sur une ligne qui ne mène à rien.
    const rollup = rollupMeasuresByCandidacy(
      [
        { candidacyId: "publique", theme: "SANTE" },
        { candidacyId: "brouillon", theme: "SANTE" },
        { candidacyId: "brouillon", theme: "LOGEMENT_URBANISME" },
      ],
      new Set(["publique"])
    );

    expect(rollup.get("publique")).toEqual({ measureCount: 1, themesCoveredCount: 1 });
    expect(rollup.has("brouillon")).toBe(false);
  });

  it("compte les sujets distincts, pas les mesures", () => {
    const rollup = rollupMeasuresByCandidacy(
      [
        { candidacyId: "c1", theme: "SANTE" },
        { candidacyId: "c1", theme: "SANTE" },
        { candidacyId: "c1", theme: "LOGEMENT_URBANISME" },
      ],
      new Set(["c1"])
    );

    expect(rollup.get("c1")).toEqual({ measureCount: 3, themesCoveredCount: 2 });
  });

  it("ignore une mesure sans candidature", () => {
    const rollup = rollupMeasuresByCandidacy([{ candidacyId: null, theme: "SANTE" }], new Set());
    expect(rollup.size).toBe(0);
  });
});

describe("resolveProgrammeAbsence", () => {
  it("n'impute jamais notre retard au candidat", () => {
    expect(resolveProgrammeAbsence(0, true)).toBe("non_depouille");
    expect(resolveProgrammeAbsence(0, false)).toBe("aucun_programme");
  });

  it("ne qualifie aucune absence dès qu'une mesure existe", () => {
    expect(resolveProgrammeAbsence(1, false)).toBeNull();
    expect(resolveProgrammeAbsence(12, true)).toBeNull();
  });
});
