import { describe, it, expect } from "vitest";
import { computeAffairCounts } from "@/lib/affairs/affair-counts";

type A = { status: string; involvement: string };
const a = (status: string, involvement: string): A => ({ status, involvement });

describe("computeAffairCounts — compteurs par rôle (RGPD art. 10)", () => {
  it("adverseAffairsCount = DIRECT/INDIRECT + statuts à charge (Tier 1+2)", () => {
    const counts = computeAffairCounts([
      a("CONDAMNATION_DEFINITIVE", "DIRECT"),
      a("MISE_EN_EXAMEN", "INDIRECT"),
      a("ENQUETE_PRELIMINAIRE", "DIRECT"), // exclu (Tier 3)
      a("RELAXE", "DIRECT"), // exclu (favorable)
      a("CONDAMNATION_DEFINITIVE", "MENTIONED_ONLY"), // exclu (involvement)
    ]);
    expect(counts.adverseAffairsCount).toBe(2);
  });

  it("affairsMentionedCount = MENTIONED_ONLY", () => {
    const counts = computeAffairCounts([
      a("CONDAMNATION_DEFINITIVE", "MENTIONED_ONLY"),
      a("ENQUETE_PRELIMINAIRE", "MENTIONED_ONLY"),
      a("RELAXE", "DIRECT"),
    ]);
    expect(counts.affairsMentionedCount).toBe(2);
  });

  it("affairsVictimOrPlaintiffCount = VICTIM + PLAINTIFF", () => {
    const counts = computeAffairCounts([
      a("ENQUETE_PRELIMINAIRE", "VICTIM"),
      a("ENQUETE_PRELIMINAIRE", "PLAINTIFF"),
      a("CONDAMNATION_DEFINITIVE", "DIRECT"),
    ]);
    expect(counts.affairsVictimOrPlaintiffCount).toBe(2);
  });

  it("favorableOutcomeCount = DIRECT/INDIRECT + issues favorables (prescription incluse)", () => {
    const counts = computeAffairCounts([
      a("RELAXE", "DIRECT"),
      a("ACQUITTEMENT", "INDIRECT"),
      a("NON_LIEU", "DIRECT"),
      a("CLASSEMENT_SANS_SUITE", "DIRECT"),
      a("PRESCRIPTION", "DIRECT"),
      a("RELAXE", "VICTIM"), // exclu (involvement)
      a("CONDAMNATION_DEFINITIVE", "DIRECT"), // exclu (à charge)
    ]);
    expect(counts.favorableOutcomeCount).toBe(5);
  });

  it("liste vide → tous les compteurs à 0", () => {
    expect(computeAffairCounts([])).toEqual({
      adverseAffairsCount: 0,
      affairsMentionedCount: 0,
      affairsVictimOrPlaintiffCount: 0,
      favorableOutcomeCount: 0,
    });
  });

  it("une ENQUETE_PRELIMINAIRE DIRECT n'entre dans aucun compteur (ni à charge ni favorable)", () => {
    const counts = computeAffairCounts([a("ENQUETE_PRELIMINAIRE", "DIRECT")]);
    expect(counts).toEqual({
      adverseAffairsCount: 0,
      affairsMentionedCount: 0,
      affairsVictimOrPlaintiffCount: 0,
      favorableOutcomeCount: 0,
    });
  });
});
