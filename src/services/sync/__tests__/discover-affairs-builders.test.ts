import { describe, it, expect } from "vitest";
import {
  buildWikidataDiscoveredAffair,
  type WikidataDiscoveredAffairInput,
} from "@/services/sync/discover-affairs-builders";

const baseInput: WikidataDiscoveredAffairInput = {
  politicianId: "pol_1",
  politicianName: "Jean Testeur",
  qid: "Q424242",
  prop: "P1399",
  offenseLabel: "corruption",
  category: "CORRUPTION",
  status: "CONDAMNATION_DEFINITIVE",
  penaltyData: {},
  decisionId: "dec_1",
};

describe("buildWikidataDiscoveredAffair — invariant I1 (RGPD art. 10)", () => {
  it("une condamnation P1399 avec infraction connue reste DRAFT", () => {
    const affair = buildWikidataDiscoveredAffair(baseInput);
    expect(affair.publicationStatus).toBe("DRAFT");
  });

  it("une charge P1595 reste DRAFT", () => {
    const affair = buildWikidataDiscoveredAffair({
      ...baseInput,
      prop: "P1595",
      status: "MISE_EN_EXAMEN",
    });
    expect(affair.publicationStatus).toBe("DRAFT");
  });

  it("conserve le comportement existant hors publication", () => {
    const conviction = buildWikidataDiscoveredAffair(baseInput);
    expect(conviction.involvement).toBe("DIRECT");
    expect(conviction.title).toBe("corruption — Jean Testeur");
    expect(conviction.confidenceScore).toBe(95);
    expect(conviction.decisionId).toBe("dec_1");

    const charge = buildWikidataDiscoveredAffair({ ...baseInput, prop: "P1595" });
    expect(charge.involvement).toBe("MENTIONED_ONLY");
    expect(charge.title).toBe("[À VÉRIFIER] corruption — Jean Testeur");
    expect(charge.confidenceScore).toBe(75);
  });

  it("le type interdit PUBLISHED à la compilation", () => {
    const affair = buildWikidataDiscoveredAffair(baseInput);
    // @ts-expect-error publicationStatus est le littéral "DRAFT", PUBLISHED est inassignable
    affair.publicationStatus = "PUBLISHED";
  });
});

// Affaires v2, lot 1: Wikidata carries a decision date, not a facts date.
// Squeezing it into factsDate is what made created affairs store a wrong
// factsDate while leaving verdictDate NULL, and forced the reconciliation path
// to read it back out behind a `phase === "wikidata"` guard.
describe("sémantique des dates — factsDate n'est pas verdictDate", () => {
  const verdictDate = new Date("2026-05-13T00:00:00.000Z");

  it("la phase Wikidata renseigne verdictDate et laisse factsDate à null", () => {
    const affair = buildWikidataDiscoveredAffair({
      ...baseInput,
      penaltyData: { verdictDate, prisonMonths: 24 },
    });

    expect(affair.verdictDate).toEqual(verdictDate);
    expect(affair.factsDate).toBeNull();
  });

  it("sans date de décision, les deux champs restent nuls", () => {
    const affair = buildWikidataDiscoveredAffair({ ...baseInput, penaltyData: {} });

    expect(affair.verdictDate).toBeNull();
    expect(affair.factsDate).toBeNull();
  });

  it("le champ verdictDate existe sur le type et n'est jamais alimenté par factsDate", () => {
    const affair = buildWikidataDiscoveredAffair({
      ...baseInput,
      penaltyData: { verdictDate },
    });

    // Regression guard: these two must never hold the same value by construction.
    expect(affair.factsDate).not.toEqual(affair.verdictDate);
  });
});
