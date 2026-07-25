import { describe, it, expect } from "vitest";
import { resolveDecisionField, resolveDecisionFields } from "../decision-fields";

// Issue #536 — the transition rule. An affair's own value is the editorial record and
// wins; a single linked decision fills a gap; several linked decisions yield no flat
// value at all, because choosing one would be an implicit editorial decision.

describe("resolveDecisionField — priorité à la valeur historique (#536)", () => {
  it("garde la valeur de l'affaire quand elle existe", () => {
    const r = resolveDecisionField("ECLI:AFFAIRE", ["ECLI:DECISION"]);

    expect(r).toEqual({ value: "ECLI:AFFAIRE", source: "affair" });
  });

  it("garde la valeur de l'affaire même face à plusieurs décisions", () => {
    const r = resolveDecisionField("96-83.698", ["11-11.111", "22-22.222"]);

    expect(r.value).toBe("96-83.698");
    expect(r.source).toBe("affair");
  });

  it("reprend la décision unique quand l'affaire ne dit rien", () => {
    const r = resolveDecisionField(null, ["ECLI:DECISION"]);

    expect(r).toEqual({ value: "ECLI:DECISION", source: "decision" });
  });

  it("ne rend AUCUNE valeur plate avec plusieurs décisions liées", () => {
    const r = resolveDecisionField(null, ["11-11.111", "22-22.222"]);

    expect(r).toEqual({ value: null, source: "ambiguous" });
  });

  it("ne choisit pas la seule décision porteuse parmi plusieurs", () => {
    // Ce serait exactement le choix implicite que cette fonction refuse.
    const r = resolveDecisionField(null, [null, "22-22.222"]);

    expect(r.value).toBeNull();
    expect(r.source).toBe("ambiguous");
  });

  it("ne choisit jamais la décision la plus récente", () => {
    // Sur une affaire couvrant première instance, appel puis cassation, la plus
    // récente est souvent un rejet de forme, pas le résultat attendu du lecteur.
    const r = resolveDecisionField(null, ["ancienne", "récente"]);

    expect(r.value).toBeNull();
  });

  it("rend absent quand ni l'affaire ni la décision unique ne portent la valeur", () => {
    expect(resolveDecisionField(null, [null])).toEqual({ value: null, source: "absent" });
    expect(resolveDecisionField(null, [])).toEqual({ value: null, source: "absent" });
  });

  it("traite la chaîne vide comme absente, des deux côtés", () => {
    expect(resolveDecisionField("", ["ECLI:DECISION"]).source).toBe("decision");
    expect(resolveDecisionField("", [""]).source).toBe("absent");
  });
});

describe("resolveDecisionFields — vue complète (#536)", () => {
  it("rend le comportement historique quand l'affaire porte tout", () => {
    const r = resolveDecisionFields(
      { ecli: "ECLI:A", pourvoiNumber: "96-83.698", chamber: "11e chambre" },
      []
    );

    expect(r.ecli.value).toBe("ECLI:A");
    expect(r.pourvoiNumber.value).toBe("96-83.698");
    expect(r.chamber.value).toBe("11e chambre");
    expect(r.hasMultipleDecisions).toBe(false);
    expect(r.decisionCount).toBe(0);
  });

  it("comble les vides depuis une décision unique", () => {
    const r = resolveDecisionFields({ ecli: null, pourvoiNumber: null, chamber: null }, [
      { ecli: "ECLI:D", pourvoiNumber: "97-81.102", chamber: "2e chambre" },
    ]);

    expect(r.ecli).toEqual({ value: "ECLI:D", source: "decision" });
    expect(r.pourvoiNumber.value).toBe("97-81.102");
    expect(r.decisionCount).toBe(1);
    expect(r.hasMultipleDecisions).toBe(false);
  });

  it("n'offre aucune valeur plate quand deux décisions sont liées", () => {
    const r = resolveDecisionFields({}, [
      { pourvoiNumber: "11-11.111" },
      { pourvoiNumber: "22-22.222" },
    ]);

    expect(r.pourvoiNumber.value).toBeNull();
    expect(r.pourvoiNumber.source).toBe("ambiguous");
    expect(r.hasMultipleDecisions).toBe(true);
    expect(r.decisionCount).toBe(2);
  });

  it("mélange les provenances champ par champ", () => {
    const r = resolveDecisionFields({ ecli: "ECLI:AFFAIRE", chamber: null }, [
      { ecli: "ECLI:DECISION", chamber: "3e chambre" },
    ]);

    expect(r.ecli.source).toBe("affair");
    expect(r.chamber.source).toBe("decision");
  });

  it("ne couvre ni court ni verdictDate : ils restent éditoriaux", () => {
    const resolved = resolveDecisionFields({}, [{}]);

    expect(resolved).not.toHaveProperty("court");
    expect(resolved).not.toHaveProperty("verdictDate");
  });

  it("reproduit le cas réel de la décision partagée", () => {
    // Une décision, deux fiches. Chaque fiche porte déjà son pourvoi, donc chacune
    // continue d'afficher exactement ce qu'elle affichait avant : le rattachement
    // n'introduit aucune suggestion de doublon.
    const shared = { pourvoiNumber: "96-83.698", ecli: null, chamber: null };
    for (const affair of [{ pourvoiNumber: "96-83.698" }, { pourvoiNumber: "96-83.698" }]) {
      const r = resolveDecisionFields(affair, [shared]);
      expect(r.pourvoiNumber).toEqual({ value: "96-83.698", source: "affair" });
      expect(r.hasMultipleDecisions).toBe(false);
      expect(r.decisionCount).toBe(1);
    }
  });
});
