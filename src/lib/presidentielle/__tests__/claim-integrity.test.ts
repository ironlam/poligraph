import { describe, expect, it } from "vitest";
import { isTruncatedClaim } from "../claim-integrity";

/**
 * Le cas réel : sur une passe de génération, la fiche Ruffin s'est terminée sur « ...les
 * activités des anciens ministres ( » et tous les filtres l'ont acceptée. La parenthèse
 * orpheline vient de `stripEvidenceMarkers`, qui a retiré le « M12 » résiduel derrière elle.
 */
describe("isTruncatedClaim", () => {
  it("attrape la parenthèse orpheline observée sur la fiche Ruffin", () => {
    expect(
      isTruncatedClaim(
        "Une Haute Autorité à la Probité serait créée, incluant un droit de regard prolongé sur les activités des anciens ministres ("
      )
    ).toBe(true);
  });

  it.each([
    ["Le programme encadre les loyers", "pas de ponctuation finale"],
    ["Le programme encadre les loyers (sous conditions.", "parenthèse jamais refermée"],
    ["Le programme encadre les loyers) sous conditions.", "parenthèse fermante orpheline"],
    ["Le programme cite [M1 et poursuit.", "crochet jamais refermé"],
    ["   ", "texte vide après nettoyage"],
  ])("rejette %j (%s)", (claim) => {
    expect(isTruncatedClaim(claim)).toBe(true);
  });

  it.each([
    "Le programme encadre les loyers.",
    "Le programme encadre les loyers (avec des exceptions définies).",
    "Le programme rouvre des maternités, développe les centres de santé et supprime l'avance de frais !",
    "Le projet prévoit-il la gratuité ?",
  ])("accepte %j", (claim) => {
    expect(isTruncatedClaim(claim)).toBe(false);
  });
});
