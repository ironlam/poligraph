import { describe, it, expect } from "vitest";
import {
  LISNARD_CARNETS_SEED,
  normalizeMeasureText,
  type ProgramEditionSeed,
  type ProgramMeasureSeed,
} from "../lib/lisnard-carnets-seed";

const ALL_MEASURES: ProgramMeasureSeed[] = LISNARD_CARNETS_SEED.editions.flatMap(
  (edition) => edition.measures
);

function edition(theme: "Santé" | "Agriculture"): ProgramEditionSeed {
  const found = LISNARD_CARNETS_SEED.editions.find((candidate) =>
    candidate.label.startsWith(`Carnet ${theme} `)
  );
  if (!found) throw new Error(`Carnet ${theme} absent du seed`);
  return found;
}

/**
 * The seed writes public editorial content attributed to a named candidate. A defect here is not
 * a display glitch: it is a proposition put in someone's mouth, or a source a reader cannot
 * check. These are the properties the script itself cannot verify at runtime.
 */
describe("seed carnets Lisnard : intégrité du corpus", () => {
  it("porte les deux carnets transcrits", () => {
    expect(LISNARD_CARNETS_SEED.editions.map((edition) => edition.label)).toEqual([
      "Carnet Santé de Nouvelle Énergie, version relevée le 21 août 2026",
      "Carnet Agriculture de Nouvelle Énergie, version relevée le 21 août 2026",
    ]);
  });

  it("vise la candidature de David Lisnard à la présidentielle 2027", () => {
    expect(LISNARD_CARNETS_SEED.politicianSlug).toBe("david-lisnard");
    expect(LISNARD_CARNETS_SEED.electionSlug).toBe("presidentielle-2027");
  });

  it("attribue les propositions au candidat lui-même", () => {
    // The booklets are signed by the candidate; PARTY_PROGRAM would say the opposite.
    expect(LISNARD_CARNETS_SEED.attribution).toBe("PERSONAL");
  });

  it("ne contient aucun doublon interne", () => {
    const keys = ALL_MEASURES.map((measure) => normalizeMeasureText(measure.text));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("énonce chaque proposition comme une phrase complète", () => {
    for (const measure of ALL_MEASURES) {
      expect(measure.text.length).toBeGreaterThan(30);
      expect(measure.text.endsWith(".")).toBe(true);
      expect(measure.text.trim()).toBe(measure.text);
    }
  });

  it("rattache chaque proposition à une page du carnet", () => {
    for (const measure of ALL_MEASURES) {
      expect(measure.page).toMatch(/^\d+$/);
    }
  });

  /**
   * `MeasureSource.url` is not nullable and the 60 % primary-source threshold of the measures spec
   * only stays auditable while these URLs point at the candidate's own site.
   */
  it("source chaque carnet sur le site du mouvement", () => {
    for (const edition of LISNARD_CARNETS_SEED.editions) {
      expect(edition.sourceUrl).toMatch(
        /^https:\/\/www\.unenouvelleenergie\.fr\/notre-programme\//
      );
      expect(edition.documentUrl).toMatch(
        /^https:\/\/www\.unenouvelleenergie\.fr\/notre-programme\//
      );
      expect(edition.sourceKind).toBe("PROPOSITIONS_CANDIDAT");
    }
  });

  it("ne déclare CHIFFREE que les propositions qui portent un chiffre", () => {
    for (const measure of ALL_MEASURES) {
      const hasFigure = /\d/.test(measure.text) || /\b(cinq|dix|vingt)\b/i.test(measure.text);
      if (measure.precision === "CHIFFREE") expect(hasFigure).toBe(true);
    }
  });

  it("classe le carnet Agriculture hors du thème Santé", () => {
    const agriculture = edition("Agriculture");
    for (const measure of agriculture.measures) {
      expect(["AGRICULTURE_ALIMENTATION", "INSTITUTIONS"]).toContain(measure.theme);
    }
    // The theme the candidacy was entirely missing, which is what motivated the seed.
    expect(
      agriculture.measures.filter((measure) => measure.theme === "AGRICULTURE_ALIMENTATION").length
    ).toBeGreaterThan(20);
  });

  it("classe le carnet Santé dans le thème Santé", () => {
    for (const measure of edition("Santé").measures) {
      expect(measure.theme).toBe("SANTE");
    }
  });
});

/**
 * The normalization IS the idempotency guarantee: two transcriptions of the same sentence must
 * collapse onto the same key, or a rerun duplicates the measure on the public fiche.
 */
describe("seed carnets Lisnard : clé d'idempotence", () => {
  it("ignore la casse, les accents, les apostrophes et la ponctuation", () => {
    expect(normalizeMeasureText("Supprimer les impôts de production agricoles.")).toBe(
      normalizeMeasureText("supprimer les impots de production agricoles")
    );
    expect(normalizeMeasureText("l’élevage, producteur de protéines")).toBe(
      normalizeMeasureText("l'elevage producteur de proteines")
    );
  });

  it("ne confond pas deux propositions différentes", () => {
    expect(normalizeMeasureText("Supprimer les impôts de production agricoles.")).not.toBe(
      normalizeMeasureText("Supprimer les surtranspositions françaises des normes européennes.")
    );
  });
});
