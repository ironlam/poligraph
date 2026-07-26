import { describe, it, expect } from "vitest";
import { resolveDecisionField, resolveDecisionFields } from "../decision-fields";

// Issue #545 — the linked decisions are the only source. The affair side is gone:
// nothing writes those columns any more, so preferring them would freeze whatever a
// backfill happened to leave there. Several linked decisions still yield no flat
// value at all, because choosing one would be an implicit editorial decision.

describe("resolveDecisionField — la décision est la seule source (#545)", () => {
  it("reprend la valeur de la décision unique", () => {
    const r = resolveDecisionField(["ECLI:DECISION"]);

    expect(r).toEqual({ value: "ECLI:DECISION", source: "decision" });
  });

  it("ne rend AUCUNE valeur plate avec plusieurs décisions liées", () => {
    const r = resolveDecisionField(["11-11.111", "22-22.222"]);

    expect(r).toEqual({ value: null, source: "ambiguous" });
  });

  it("ne choisit pas la seule décision porteuse parmi plusieurs", () => {
    // Ce serait exactement le choix implicite que cette fonction refuse.
    const r = resolveDecisionField([null, "22-22.222"]);

    expect(r.value).toBeNull();
    expect(r.source).toBe("ambiguous");
  });

  it("ne choisit jamais la décision la plus récente", () => {
    // Sur une affaire couvrant première instance, appel puis cassation, la plus
    // récente est souvent un rejet de forme, pas le résultat attendu du lecteur.
    const r = resolveDecisionField(["ancienne", "récente"]);

    expect(r.value).toBeNull();
  });

  it("rend absent sans décision, ou quand la décision unique ne porte rien", () => {
    expect(resolveDecisionField([])).toEqual({ value: null, source: "absent" });
    expect(resolveDecisionField([null])).toEqual({ value: null, source: "absent" });
    expect(resolveDecisionField([undefined])).toEqual({ value: null, source: "absent" });
  });

  it("traite la chaîne vide comme absente", () => {
    expect(resolveDecisionField([""])).toEqual({ value: null, source: "absent" });
  });

  it("ne rend jamais la provenance « affair »", () => {
    // Le type la conserve pour qu'une valeur journalisée avant #545 se relise, mais
    // plus aucun chemin ne la produit.
    for (const decisions of [[], [null], ["x"], ["a", "b"]]) {
      expect(resolveDecisionField(decisions).source).not.toBe("affair");
    }
  });
});

describe("resolveDecisionFields — vue complète (#545)", () => {
  it("rend tout absent sans décision rattachée", () => {
    const r = resolveDecisionFields([]);

    expect(r.ecli.value).toBeNull();
    expect(r.pourvoiNumber.value).toBeNull();
    expect(r.chamber.value).toBeNull();
    expect(r.hasMultipleDecisions).toBe(false);
    expect(r.decisionCount).toBe(0);
  });

  it("lit les trois champs depuis une décision unique", () => {
    const r = resolveDecisionFields([
      { ecli: "ECLI:D", pourvoiNumber: "97-81.102", chamber: "Chambre criminelle" },
    ]);

    expect(r.ecli).toEqual({ value: "ECLI:D", source: "decision" });
    expect(r.pourvoiNumber.value).toBe("97-81.102");
    expect(r.chamber.value).toBe("Chambre criminelle");
    expect(r.decisionCount).toBe(1);
    expect(r.hasMultipleDecisions).toBe(false);
  });

  it("n'offre aucune valeur plate quand deux décisions sont liées", () => {
    const r = resolveDecisionFields([
      { pourvoiNumber: "11-11.111" },
      { pourvoiNumber: "22-22.222" },
    ]);

    expect(r.pourvoiNumber.value).toBeNull();
    expect(r.pourvoiNumber.source).toBe("ambiguous");
    expect(r.hasMultipleDecisions).toBe(true);
    expect(r.decisionCount).toBe(2);
  });

  it("champ par champ : un vide reste vide, un renseigné se lit", () => {
    const r = resolveDecisionFields([{ ecli: null, chamber: "Chambre criminelle" }]);

    expect(r.ecli.source).toBe("absent");
    expect(r.chamber.source).toBe("decision");
  });

  it("ne couvre ni court ni verdictDate : ils restent éditoriaux", () => {
    const resolved = resolveDecisionFields([{}]);

    expect(resolved).not.toHaveProperty("court");
    expect(resolved).not.toHaveProperty("verdictDate");
  });

  it("reproduit le cas réel de la décision partagée", () => {
    // Une décision, deux fiches. Chacune affiche la même référence, et le
    // rattachement n'introduit aucune suggestion de doublon.
    const shared = { pourvoiNumber: "96-83.698", ecli: null, chamber: "Chambre criminelle" };

    for (let fiche = 0; fiche < 2; fiche++) {
      const r = resolveDecisionFields([shared]);
      expect(r.pourvoiNumber).toEqual({ value: "96-83.698", source: "decision" });
      expect(r.hasMultipleDecisions).toBe(false);
      expect(r.decisionCount).toBe(1);
    }
  });
});
