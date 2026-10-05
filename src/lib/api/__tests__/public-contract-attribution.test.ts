import { describe, expect, it } from "vitest";
import { getPublicAffairSemantics } from "@/lib/api/public-contract";
import { computeAffairCounts } from "@/lib/affairs/affair-counts";
import { ATTRIBUTION_ROWS } from "@/lib/affairs/__tests__/fixtures/attribution";

const semantics = (row: (typeof ATTRIBUTION_ROWS)[number]) =>
  getPublicAffairSemantics({
    status: row.status,
    category: "CORRUPTION",
    involvement: row.involvement,
    jurisdictionOrder: row.jurisdictionOrder,
  });

describe("contrat d'API : attribution à charge", () => {
  it.each(ATTRIBUTION_ROWS)("$key : countedInAdverseAggregates vaut expectedAdverse", (row) => {
    expect(semantics(row).countedInAdverseAggregates).toBe(row.expectedAdverse);
  });

  it("la somme des countedInAdverseAggregates d'une fiche égale son adverseAffairsCount", () => {
    const perAffair = ATTRIBUTION_ROWS.filter(
      (row) => semantics(row).countedInAdverseAggregates
    ).length;
    expect(computeAffairCounts(ATTRIBUTION_ROWS).adverseAffairsCount).toBe(perAffair);
  });

  it("un témoin INDIRECT n'a ni statusAppliesToPolitician, ni certaintyLevel, ni needsPresumption", () => {
    const witness = ATTRIBUTION_ROWS.find((row) => row.key === "indirectWitnessConvicted")!;
    expect(semantics(witness)).toMatchObject({
      statusAppliesToPolitician: false,
      certaintyLevel: null,
      certaintyLabel: null,
      needsPresumption: false,
    });
  });
});
