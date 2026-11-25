import { describe, expect, it } from "vitest";
import {
  candidacyFieldDescription,
  candidacyFieldFaq,
  candidacyFieldLead,
  candidacyFieldTitle,
  summarizeCandidacyField,
  type SummarizableCandidacy,
} from "../candidacy-field-summary";

const field: SummarizableCandidacy[] = [
  { candidateName: "Alix Dupont", status: "DECLARE", recordedAt: new Date("2026-09-01") },
  { candidateName: "Bea Martin", status: "OFFICIAL", recordedAt: new Date("2026-09-02") },
  {
    candidateName: "Cyril Petit",
    status: "PRESSENTI",
    recordedAt: new Date("2026-10-01"),
  },
  {
    candidateName: "Dana Roux",
    status: "RETIRE",
    recordedAt: new Date("2026-08-01"),
    statusChangedAt: new Date("2026-11-21T12:00:00Z"),
  },
  {
    candidateName: "Eli Blanc",
    status: "ENVISAGE",
    lastMeasurePublishedAt: new Date("2026-11-03"),
  },
];

describe("summarizeCandidacyField", () => {
  it("compte les candidatures annoncées, pressenties et retirées, sans les hypothèses de presse", () => {
    const summary = summarizeCandidacyField(field);

    expect(summary.announced).toEqual(["Alix Dupont", "Bea Martin"]);
    expect(summary.expected).toEqual(["Cyril Petit"]);
    expect(summary.withdrawnCount).toBe(1);
  });

  it("date la liste de son dernier changement, pas du rendu", () => {
    expect(summarizeCandidacyField(field).lastUpdatedAt).toEqual(new Date("2026-11-21T12:00:00Z"));
    expect(summarizeCandidacyField([]).lastUpdatedAt).toBeNull();
  });
});

describe("textes de l'annuaire", () => {
  const summary = summarizeCandidacyField(field);

  it("met le nombre dans un title de 60 caractères au plus", () => {
    const title = candidacyFieldTitle(summary);

    expect(title).toBe("Candidats présidentielle 2027 : 2 déclarés (liste à jour)");
    expect(title!.length).toBeLessThanOrEqual(60);
    const many = summarizeCandidacyField(
      Array.from({ length: 132 }, (_, i) => ({
        candidateName: `C${i}`,
        status: "DECLARE" as const,
      }))
    );
    expect(candidacyFieldTitle(many)!.length).toBeLessThanOrEqual(60);
  });

  it("accorde le singulier", () => {
    const one = summarizeCandidacyField([{ candidateName: "Alix Dupont", status: "DECLARE" }]);

    expect(candidacyFieldTitle(one)).toBe(
      "Candidats présidentielle 2027 : 1 déclaré (liste à jour)"
    );
    expect(candidacyFieldLead(one)).toBe(
      "1 personnalité a annoncé sa candidature à la présidentielle 2027."
    );
  });

  it("ouvre la description sur la date et le nombre", () => {
    expect(candidacyFieldDescription(summary)).toBe(
      "Au 21 novembre 2026, 2 personnalités ont annoncé leur candidature à la présidentielle 2027, 1 autre est pressentie. Pour chacune : la source du statut, le parti et, quand il est publié, le programme."
    );
  });

  it("résume les pressentis et les retraits sous le titre", () => {
    expect(candidacyFieldLead(summary)).toBe(
      "2 personnalités ont annoncé leur candidature à la présidentielle 2027. 1 autre est pressentie et 1 candidature a été retirée ou écartée."
    );
  });

  it("répond par les noms à « qui est candidat »", () => {
    const who = candidacyFieldFaq(summary)[1]!;

    expect(who.answer).toContain("Alix Dupont, Bea Martin");
    expect(who.answer).toContain("Est pressentie : Cyril Petit.");
    expect(who.answer).not.toContain("Dana Roux");
  });

  it("ne produit ni title, ni phrase, ni FAQ pour un annuaire sans candidature annoncée", () => {
    const empty = summarizeCandidacyField([{ candidateName: "X", status: "PRESSENTI" }]);

    expect(candidacyFieldTitle(empty)).toBeNull();
    expect(candidacyFieldDescription(empty)).toBeNull();
    expect(candidacyFieldLead(empty)).toBeNull();
    expect(candidacyFieldFaq(empty)).toEqual([]);
  });

  it("n'écrit aucun tiret long", () => {
    const texts = [
      candidacyFieldTitle(summary),
      candidacyFieldDescription(summary),
      candidacyFieldLead(summary),
      ...candidacyFieldFaq(summary).flatMap((e) => [e.question, e.answer]),
    ].join(" ");

    expect(texts).not.toMatch(/[–—]/);
  });
});
