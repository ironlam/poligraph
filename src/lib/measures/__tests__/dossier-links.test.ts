import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("../cache", () => ({ invalidateMeasureTags: vi.fn() }));

import { checkDossierLinkEvidence, dossierEvidenceText } from "../dossier-links";

const revisionText = "Plafonner les frais bancaires pour tous les clients particuliers";
const dossier = {
  title: "Plafonner et supprimer les frais bancaires injustes",
  exposeDesMotifs: "L'article 52 introduit un plafonnement des commissions d'intervention.",
};
const ok = {
  measureQuote: "Plafonner les frais bancaires pour tous les clients",
  textQuote: "Plafonner et supprimer les frais bancaires injustes",
  rationale: "Même dispositif : plafonnement des frais bancaires.",
  reviewedBy: "Lamine",
};

describe("checkDossierLinkEvidence", () => {
  it("accepte deux citations retrouvées, relecteur et justification présents", () => {
    expect(checkDossierLinkEvidence(ok, revisionText, dossier)).toBeNull();
  });

  it("refuse une citation de mesure absente de la révision", () => {
    const refusal = checkDossierLinkEvidence(
      { ...ok, measureQuote: "Supprimer tous les frais bancaires de tenue de compte" },
      revisionText,
      dossier
    );
    expect(refusal).toContain("citation de la mesure");
  });

  it("refuse une citation du texte absente du titre et de l'exposé des motifs", () => {
    const refusal = checkDossierLinkEvidence(
      { ...ok, textQuote: "Le Parlement instaure un plafond sur les frais bancaires courants" },
      revisionText,
      dossier
    );
    expect(refusal).toContain("citation du texte");
  });

  it("accepte une citation prise dans l'exposé des motifs", () => {
    expect(
      checkDossierLinkEvidence(
        { ...ok, textQuote: "introduit un plafonnement des commissions d'intervention" },
        revisionText,
        dossier
      )
    ).toBeNull();
  });

  it("refuse sans relecteur ni justification", () => {
    expect(checkDossierLinkEvidence({ ...ok, reviewedBy: "  " }, revisionText, dossier)).toContain(
      "relecteur"
    );
    expect(checkDossierLinkEvidence({ ...ok, rationale: "" }, revisionText, dossier)).toContain(
      "justification"
    );
  });

  it("ne prend pas le résumé IA comme preuve", () => {
    const withSummary = { ...dossier, summary: "Un plafond universel des frais bancaires." };
    expect(dossierEvidenceText(withSummary)).not.toContain("plafond universel");
  });
});
