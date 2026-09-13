import { describe, it, expect } from "vitest";
import { computeJudicialCounts } from "@/lib/politicians/judicial-counts";
import type { AffairInput } from "@/lib/politicians/judicial-counts";

const a = (
  involvement: AffairInput["involvement"],
  status: AffairInput["status"],
  jurisdictionOrder: AffairInput["jurisdictionOrder"] = "PENAL"
): AffairInput => ({ involvement, status, jurisdictionOrder });

describe("computeJudicialCounts", () => {
  it("separates definitive from non-definitive convictions (DIRECT only)", () => {
    const counts = computeJudicialCounts([
      a("DIRECT", "CONDAMNATION_DEFINITIVE"),
      a("DIRECT", "CONDAMNATION_PREMIERE_INSTANCE"),
      a("DIRECT", "APPEL_EN_COURS"),
    ]);
    expect(counts.condamnationsDefinitives).toBe(1);
    expect(counts.condamnationsNonDefinitives).toBe(2);
    expect(counts.proceduresEnCours).toBe(0);
  });

  it("counts PROCEDURE_VALIDEE as procedures but excludes ENQUETE_PRELIMINAIRE (RGPD)", () => {
    const counts = computeJudicialCounts([
      a("DIRECT", "MISE_EN_EXAMEN"),
      a("DIRECT", "INSTRUCTION"),
      a("DIRECT", "RENVOI_TRIBUNAL"),
      a("DIRECT", "PROCES_EN_COURS"),
      a("DIRECT", "ENQUETE_PRELIMINAIRE"),
    ]);
    expect(counts.proceduresEnCours).toBe(4);
    expect(counts.condamnationsDefinitives).toBe(0);
    expect(counts.condamnationsNonDefinitives).toBe(0);
  });

  it("does NOT double-count INDIRECT: it is a mention, never a conviction/procedure", () => {
    const counts = computeJudicialCounts([
      a("INDIRECT", "CONDAMNATION_DEFINITIVE"),
      a("INDIRECT", "MISE_EN_EXAMEN"),
      a("MENTIONED_ONLY", "PROCES_EN_COURS"),
    ]);
    expect(counts.condamnationsDefinitives).toBe(0);
    expect(counts.proceduresEnCours).toBe(0);
    expect(counts.mentionneOuSecondaire).toBe(3);
  });

  it("groups victim and plaintiff", () => {
    const counts = computeJudicialCounts([
      a("VICTIM", "PROCES_EN_COURS"),
      a("PLAINTIFF", "INSTRUCTION"),
    ]);
    expect(counts.victimeOuPlaignant).toBe(2);
    expect(counts.mentionneOuSecondaire).toBe(0);
  });

  it("badgeCount = DIRECT judicially-validated (Tier 1+2), excludes enquete/victim/mention", () => {
    const counts = computeJudicialCounts([
      a("DIRECT", "CONDAMNATION_DEFINITIVE"),
      a("DIRECT", "MISE_EN_EXAMEN"),
      a("DIRECT", "ENQUETE_PRELIMINAIRE"),
      a("INDIRECT", "CONDAMNATION_DEFINITIVE"),
      a("VICTIM", "PROCES_EN_COURS"),
    ]);
    expect(counts.badgeCount).toBe(2);
  });
});

describe("instruction close sans mise en examen", () => {
  it("ne compte ni en procédure en cours ni dans le badge", () => {
    const counts = computeJudicialCounts([
      {
        involvement: "DIRECT",
        status: "INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN",
        jurisdictionOrder: "PENAL",
      },
    ]);
    expect(counts.proceduresEnCours).toBe(0);
    expect(counts.badgeCount).toBe(0);
    expect(counts.condamnationsDefinitives).toBe(0);
    expect(counts.condamnationsNonDefinitives).toBe(0);
  });

  it("laisse les condamnations de la même personne intactes", () => {
    const counts = computeJudicialCounts([
      {
        involvement: "DIRECT",
        status: "INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN",
        jurisdictionOrder: "PENAL",
      },
      { involvement: "DIRECT", status: "CONDAMNATION_DEFINITIVE", jurisdictionOrder: "PENAL" },
      { involvement: "DIRECT", status: "CONDAMNATION_DEFINITIVE", jurisdictionOrder: "PENAL" },
      {
        involvement: "DIRECT",
        status: "CONDAMNATION_PREMIERE_INSTANCE",
        jurisdictionOrder: "PENAL",
      },
      { involvement: "DIRECT", status: "APPEL_EN_COURS", jurisdictionOrder: "PENAL" },
    ]);
    expect(counts.condamnationsDefinitives).toBe(2);
    expect(counts.condamnationsNonDefinitives).toBe(2);
    expect(counts.proceduresEnCours).toBe(0);
    expect(counts.badgeCount).toBe(4);
  });
});

describe("ordre de juridiction", () => {
  // Une amende de la chambre du contentieux de la Cour des comptes reste sur la
  // fiche, mais « Condamnations définitives » se lit comme pénal.
  it("exclut une condamnation financière des compteurs à charge", () => {
    const counts = computeJudicialCounts([
      a("DIRECT", "CONDAMNATION_DEFINITIVE", "FINANCIER"),
      a("DIRECT", "CONDAMNATION_DEFINITIVE", "PENAL"),
    ]);

    expect(counts.condamnationsDefinitives).toBe(1);
    expect(counts.badgeCount).toBe(1);
  });

  it("exclut aussi l'ordre administratif", () => {
    const counts = computeJudicialCounts([a("DIRECT", "MISE_EN_EXAMEN", "ADMINISTRATIF")]);

    expect(counts.proceduresEnCours).toBe(0);
    expect(counts.badgeCount).toBe(0);
  });
});
