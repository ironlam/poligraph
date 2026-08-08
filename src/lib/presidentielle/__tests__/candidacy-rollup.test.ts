import { describe, expect, it } from "vitest";
import {
  resolveProgrammeAbsence,
  rollupMeasuresByCandidacy,
  type RollupMeasure,
} from "../candidacy-rollup";

/** A measure with a primary source, the ordinary case. */
function measure(
  candidacyId: string | null,
  theme: string,
  hasPrimarySource = true
): RollupMeasure {
  return { candidacyId, theme, hasPrimarySource };
}

describe("rollupMeasuresByCandidacy", () => {
  it("ne compte pas une mesure portée par une candidature que rien ne rend publiquement", () => {
    // Invariant I7, déjà tenu par `loadThemesIndex` : une mesure rattachée à une candidature dont
    // l'extension est encore DRAFT n'apparaît sur aucune page sujet et sur aucune fiche. La compter
    // ici annoncerait « 2 mesures documentées » sur une ligne qui ne mène à rien.
    const rollup = rollupMeasuresByCandidacy(
      [
        measure("publique", "SANTE"),
        measure("brouillon", "SANTE"),
        measure("brouillon", "LOGEMENT_URBANISME"),
      ],
      new Set(["publique"])
    );

    expect(rollup.get("publique")).toEqual({
      measureCount: 1,
      themesCoveredCount: 1,
      primarySourceMeasureCount: 1,
    });
    expect(rollup.has("brouillon")).toBe(false);
  });

  it("compte les sujets distincts, pas les mesures", () => {
    const rollup = rollupMeasuresByCandidacy(
      [measure("c1", "SANTE"), measure("c1", "SANTE"), measure("c1", "LOGEMENT_URBANISME")],
      new Set(["c1"])
    );

    expect(rollup.get("c1")).toEqual({
      measureCount: 3,
      themesCoveredCount: 2,
      primarySourceMeasureCount: 3,
    });
  });

  it("compte à part les mesures adossées à une source primaire", () => {
    // C'est ce nombre, et non `measureCount`, que lit le seuil de la fiche candidat. Les deux
    // coïncident aujourd'hui, donc les confondre paraîtrait correct jusqu'à la première mesure
    // tirée d'un article seul : la ligne offrirait alors un lien vers une fiche qui redirige.
    const rollup = rollupMeasuresByCandidacy(
      [
        measure("c1", "SANTE", false),
        measure("c1", "LOGEMENT_URBANISME", false),
        measure("c1", "TRANSPORTS", true),
      ],
      new Set(["c1"])
    );

    expect(rollup.get("c1")).toEqual({
      measureCount: 3,
      themesCoveredCount: 3,
      primarySourceMeasureCount: 1,
    });
  });

  it("rapporte zéro source primaire quand aucune mesure n'en porte", () => {
    const rollup = rollupMeasuresByCandidacy([measure("c1", "SANTE", false)], new Set(["c1"]));
    expect(rollup.get("c1")?.primarySourceMeasureCount).toBe(0);
  });

  it("ignore une mesure sans candidature", () => {
    const rollup = rollupMeasuresByCandidacy([measure(null, "SANTE")], new Set());
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
