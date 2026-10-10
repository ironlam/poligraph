import { describe, expect, it } from "vitest";
import { matchesAffairsFilter, summarizeAffairs } from "../affairs";

describe("summarizeAffairs", () => {
  it("sépare condamnations définitives, non définitives et procédures en cours", () => {
    expect(
      summarizeAffairs([
        { politicianId: "p1", status: "CONDAMNATION_DEFINITIVE" },
        { politicianId: "p1", status: "APPEL_EN_COURS" },
        { politicianId: "p1", status: "POURVOI_EN_CASSATION" },
        { politicianId: "p1", status: "MISE_EN_EXAMEN" },
        { politicianId: "p2", status: "CONDAMNATION_PREMIERE_INSTANCE" },
      ])
    ).toEqual({
      p1: { definitive: 1, nonDefinitive: 2, ongoing: 1 },
      p2: { definitive: 0, nonDefinitive: 1, ongoing: 0 },
    });
  });

  it("ignore une enquête préliminaire et une issue favorable", () => {
    expect(
      summarizeAffairs([
        { politicianId: "p1", status: "ENQUETE_PRELIMINAIRE" },
        { politicianId: "p1", status: "RELAXE" },
        { politicianId: "p1", status: "NON_LIEU" },
      ])
    ).toEqual({});
  });
});

describe("matchesAffairsFilter", () => {
  const ongoingOnly = { definitive: 0, nonDefinitive: 0, ongoing: 1 };
  const firstInstance = { definitive: 0, nonDefinitive: 1, ongoing: 0 };
  const definitive = { definitive: 1, nonDefinitive: 0, ongoing: 0 };

  it("« toutes » retient procédure en cours et condamnation", () => {
    expect(matchesAffairsFilter(ongoingOnly, "toutes")).toBe(true);
    expect(matchesAffairsFilter(firstInstance, "toutes")).toBe(true);
  });

  it("« condamnation » écarte une procédure sans condamnation", () => {
    expect(matchesAffairsFilter(ongoingOnly, "condamnation")).toBe(false);
    expect(matchesAffairsFilter(firstInstance, "condamnation")).toBe(true);
  });

  it("« condamnation-definitive » écarte une condamnation non définitive", () => {
    expect(matchesAffairsFilter(firstInstance, "condamnation-definitive")).toBe(false);
    expect(matchesAffairsFilter(definitive, "condamnation-definitive")).toBe(true);
  });

  it("une personne sans entrée ne passe aucun filtre", () => {
    expect(matchesAffairsFilter(undefined, "toutes")).toBe(false);
  });
});
