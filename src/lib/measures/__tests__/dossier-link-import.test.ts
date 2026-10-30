import { describe, expect, it } from "vitest";
import { planDossierLinkImport, type ImportProposal } from "../dossier-link-import";

const proposal = (over: Partial<ImportProposal> = {}): ImportProposal => ({
  measureId: "m1",
  textId: "t1",
  measureText: "Plafonner les frais bancaires",
  textTitle: "Plafonner et supprimer les frais bancaires injustes",
  q: {
    measureQuote: "Plafonner les frais bancaires",
    textQuote: "Plafonner et supprimer les frais bancaires injustes",
    rationale: "Même dispositif.",
  },
  ...over,
});

describe("planDossierLinkImport", () => {
  it("écrit le niveau décidé par le relecteur, pas celui du modèle", () => {
    const plan = planDossierLinkImport(
      [{ measureId: "m1", textId: "t1", decision: "BROADER_TEXT" }],
      [proposal()]
    );
    expect(plan.toWrite).toHaveLength(1);
    expect(plan.toWrite[0]!.linkKind).toBe("BROADER_TEXT");
    expect(plan.toWrite[0]!.dossierId).toBe("t1");
  });

  it("compte les rejets sans rien écrire", () => {
    const plan = planDossierLinkImport(
      [{ measureId: "m1", textId: "t1", decision: "REJECT" }],
      [proposal()]
    );
    expect(plan).toMatchObject({ toWrite: [], rejected: 1, problems: [] });
  });

  it("signale une décision sans proposition, en double, inconnue ou sans citation", () => {
    const plan = planDossierLinkImport(
      [
        { measureId: "m9", textId: "t9", decision: "SAME_OBJECT" },
        { measureId: "m1", textId: "t1", decision: "SAME_OBJECT" },
        { measureId: "m1", textId: "t1", decision: "SAME_OBJECT" },
        { measureId: "m2", textId: "t2", decision: "PEUT_ETRE" as never },
        { measureId: "m3", textId: "t3", decision: "SAME_OBJECT" },
      ],
      [
        proposal(),
        proposal({
          measureId: "m3",
          textId: "t3",
          q: { measureQuote: "", textQuote: "", rationale: "x" },
        }),
      ]
    );
    expect(plan.toWrite).toHaveLength(1);
    expect(plan.problems.join("\n")).toMatch(/aucune proposition/);
    expect(plan.problems.join("\n")).toMatch(/double/);
    expect(plan.problems.join("\n")).toMatch(/inconnue/);
    expect(plan.problems.join("\n")).toMatch(/citations absentes/);
  });
});
