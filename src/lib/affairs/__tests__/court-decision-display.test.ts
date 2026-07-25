import { describe, it, expect } from "vitest";
import {
  buildCourtDecisionDisplay,
  compareCourtDecisionsForDisplay,
  NO_PUBLIC_REFERENCE,
  sortCourtDecisionsForDisplay,
  type CourtDecisionDisplayInput,
} from "../court-decision-display";

// Issue #536 — a decision identified only by an ECLI, a Judilibre id or an official
// URL used to render an empty bullet. Nothing displayed may ever be empty, and the
// internal ids must never reach a reader.

const fmt = (d: Date) => d.toISOString().slice(0, 10);

function decision(overrides: Partial<CourtDecisionDisplayInput> = {}): CourtDecisionDisplayInput {
  return { id: "cms0v8b2y000039v5wlf7318r", ...overrides };
}

describe("buildCourtDecisionDisplay — jamais de ligne vide (#536)", () => {
  it("rend un pourvoi seul", () => {
    const d = buildCourtDecisionDisplay(decision({ pourvoiNumber: "96-83.698" }), fmt);

    expect(d.parts).toEqual(["Pourvoi n° 96-83.698"]);
    expect(d.isPlaceholder).toBe(false);
    expect(d.link).toBeNull();
  });

  it("rend un ECLI seul", () => {
    const d = buildCourtDecisionDisplay(decision({ ecli: "ECLI:FR:CCASS:1997:C100001" }), fmt);

    expect(d.parts).toEqual(["ECLI:FR:CCASS:1997:C100001"]);
    expect(d.isPlaceholder).toBe(false);
  });

  it("rend le pourvoi ET l'ECLI quand les deux existent", () => {
    // Deux références distinctes : un lecteur qui vérifie l'une ne doit pas avoir à
    // deviner que l'autre a été écartée.
    const d = buildCourtDecisionDisplay(
      decision({ pourvoiNumber: "96-83.698", ecli: "ECLI:FR:CCASS:1997:C100001" }),
      fmt
    );

    expect(d.parts).toEqual(["Pourvoi n° 96-83.698", "ECLI:FR:CCASS:1997:C100001"]);
  });

  it("rend juridiction, chambre, date et solution dans l'ordre de lecture", () => {
    const d = buildCourtDecisionDisplay(
      decision({
        pourvoiNumber: "96-83.698",
        court: "Cour de cassation",
        chamber: "chambre criminelle",
        decisionDate: new Date("1997-10-27T00:00:00Z"),
        solution: "rejet",
      }),
      fmt
    );

    expect(d.parts).toEqual([
      "Pourvoi n° 96-83.698",
      "Cour de cassation",
      "chambre criminelle",
      "1997-10-27",
      "rejet",
    ]);
  });

  it("donne au lien officiel un libellé accessible, jamais l'URL brute", () => {
    const d = buildCourtDecisionDisplay(
      decision({ pourvoiNumber: "96-83.698", sourceUrl: "https://www.courdecassation.fr/x" }),
      fmt
    );

    expect(d.link).toEqual({
      href: "https://www.courdecassation.fr/x",
      label: "Consulter la décision sur la source officielle",
    });
    expect(d.link!.label).not.toContain("http");
  });

  it("rend un texte non vide pour une décision sans aucun champ public", () => {
    const d = buildCourtDecisionDisplay(decision(), fmt);

    expect(d.parts).toEqual([NO_PUBLIC_REFERENCE]);
    expect(d.parts[0]!.length).toBeGreaterThan(0);
    expect(d.isPlaceholder).toBe(true);
  });

  it("rend un texte non vide pour une décision connue seulement par Judilibre", () => {
    const d = buildCourtDecisionDisplay(decision({ judilibreId: "jud_42" }), fmt);

    expect(d.parts).toEqual([NO_PUBLIC_REFERENCE]);
    expect(d.isPlaceholder).toBe(true);
  });

  it("rend le lien même sans autre référence, avec un libellé de repli", () => {
    const d = buildCourtDecisionDisplay(
      decision({ sourceUrl: "https://www.legifrance.gouv.fr/x" }),
      fmt
    );

    expect(d.isPlaceholder).toBe(true);
    expect(d.link?.href).toBe("https://www.legifrance.gouv.fr/x");
    expect(d.parts).toEqual([NO_PUBLIC_REFERENCE]);
  });

  it("n'expose jamais l'identifiant interne ni l'identifiant Judilibre", () => {
    const d = buildCourtDecisionDisplay(
      decision({ id: "cms0secret", judilibreId: "jud_secret", pourvoiNumber: "96-83.698" }),
      fmt
    );

    const rendered = [...d.parts, d.link?.label ?? "", d.link?.href ?? ""].join(" ");
    expect(rendered).not.toContain("cms0secret");
    expect(rendered).not.toContain("jud_secret");
  });

  it("ignore les chaînes vides ou blanches", () => {
    const d = buildCourtDecisionDisplay(
      decision({ pourvoiNumber: "   ", ecli: "", court: "Cour de cassation" }),
      fmt
    );

    expect(d.parts).toEqual(["Cour de cassation"]);
  });
});

describe("Ordre de présentation — stable, et ne désigne rien (#536)", () => {
  const withDate = (iso: string, id: string): CourtDecisionDisplayInput => ({
    id,
    decisionDate: new Date(iso),
  });

  it("trie par date croissante", () => {
    const sorted = sortCourtDecisionsForDisplay([
      withDate("2020-01-01", "b"),
      withDate("1997-10-27", "a"),
    ]);

    expect(sorted.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("place une décision sans date après celles qui en ont une", () => {
    const sorted = sortCourtDecisionsForDisplay([
      decision({ id: "sans-date" }),
      withDate("1997-10-27", "avec-date"),
    ]);

    expect(sorted.map((d) => d.id)).toEqual(["avec-date", "sans-date"]);
  });

  it("départage par pourvoi à date égale", () => {
    const sorted = sortCourtDecisionsForDisplay([
      { id: "b", decisionDate: new Date("1997-10-27"), pourvoiNumber: "97-81.102" },
      { id: "a", decisionDate: new Date("1997-10-27"), pourvoiNumber: "96-83.698" },
    ]);

    expect(sorted.map((d) => d.pourvoiNumber)).toEqual(["96-83.698", "97-81.102"]);
  });

  it("départage par ECLI quand le pourvoi ne suffit pas", () => {
    const sorted = sortCourtDecisionsForDisplay([
      { id: "b", ecli: "ECLI:Z" },
      { id: "a", ecli: "ECLI:A" },
    ]);

    expect(sorted.map((d) => d.ecli)).toEqual(["ECLI:A", "ECLI:Z"]);
  });

  it("finit par l'identifiant interne, pour rester stable entre deux rendus", () => {
    const a = decision({ id: "aaa" });
    const b = decision({ id: "zzz" });

    expect(sortCourtDecisionsForDisplay([b, a]).map((d) => d.id)).toEqual(["aaa", "zzz"]);
    expect(sortCourtDecisionsForDisplay([a, b]).map((d) => d.id)).toEqual(["aaa", "zzz"]);
  });

  it("ne modifie pas le tableau de l'appelant", () => {
    const input = [decision({ id: "zzz" }), decision({ id: "aaa" })];
    sortCourtDecisionsForDisplay(input);

    expect(input.map((d) => d.id)).toEqual(["zzz", "aaa"]);
  });

  it("est réflexif : comparer une décision à elle-même rend zéro", () => {
    const d = withDate("1997-10-27", "a");

    expect(compareCourtDecisionsForDisplay(d, d)).toBe(0);
  });
});
