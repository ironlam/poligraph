import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AffairsSection } from "@/components/politicians/AffairsSection";

function makeAffair(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    slug: "affaire-victime",
    title: "Affaire de test",
    description: "Faits factuels.",
    status: "CONDAMNATION_DEFINITIVE",
    category: "VIOLENCE",
    involvement: "VICTIM",
    factsDate: null,
    startDate: null,
    verdictDate: new Date("2024-01-15"),
    createdAt: new Date("2024-01-01"),
    appeal: false,
    court: null,
    chamber: null,
    caseNumber: null,
    partyAtTime: null,
    events: [],
    sources: [],
    linkedAffair: null,
    linkedBy: [],
    prisonMonths: null,
    prisonFirmMonths: null,
    ineligibilityFirmMonths: null,
    fineAmount: null,
    ineligibilityMonths: null,
    communityService: null,
    otherSentence: null,
    sentence: null,
    ...overrides,
  };
}

describe("AffairsSection — liens vers les fiches d'affaires", () => {
  it("une affaire en cause directe renvoie vers sa fiche", () => {
    const { container } = render(
      <AffairsSection
        affairs={[makeAffair({ id: "d1", slug: "affaire-directe", involvement: "DIRECT" })]}
        civility="M"
      />
    );
    expect(container.querySelector('a[href="/affaires/affaire-directe"]')).toBeTruthy();
  });

  it("une affaire où le politicien est victime renvoie vers sa fiche", () => {
    const { container } = render(<AffairsSection affairs={[makeAffair()]} civility="M" />);
    expect(container.querySelector('a[href="/affaires/affaire-victime"]')).toBeTruthy();
  });
});
