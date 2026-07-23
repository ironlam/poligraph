import { describe, it, expect } from "vitest";
import { buildPoliticianSignals } from "@/lib/politicians/signals";
import type { SignalsInput } from "@/lib/politicians/signals";

const base: SignalsInput = {
  slug: "camille-renard",
  mandatesCount: 8,
  votesTotal: 830,
  hasVotesTab: true,
  hasFactchecksTab: false,
  factchecksCount: 0,
  dossiersCount: 0,
  declarationsCount: 3,
  portfolioValue: 617000,
  patrimoineHref: "#declarations",
  judicial: {
    condamnationsDefinitives: 1,
    condamnationsNonDefinitives: 0,
    proceduresEnCours: 2,
    victimeOuPlaignant: 0,
    mentionneOuSecondaire: 0,
    badgeCount: 3,
  },
};

describe("buildPoliticianSignals", () => {
  it("omits votes when there is no votes tab", () => {
    const signals = buildPoliticianSignals({ ...base, hasVotesTab: false, votesTotal: null });
    expect(signals.find((s) => s.key === "votes")).toBeUndefined();
  });

  it("omits a judicial signal when its count is 0", () => {
    const signals = buildPoliticianSignals({
      ...base,
      judicial: { ...base.judicial, condamnationsDefinitives: 0 },
    });
    expect(signals.find((s) => s.key === "condamnations-definitives")).toBeUndefined();
  });

  it("routes each signal to its destination", () => {
    const signals = buildPoliticianSignals(base);
    const byKey = Object.fromEntries(signals.map((s) => [s.key, s]));
    expect(byKey["mandats"].href).toBe("/politiques/camille-renard?tab=carriere");
    expect(byKey["condamnations-definitives"].href).toBe("/politiques/camille-renard?tab=affaires");
    expect(byKey["patrimoine"].href).toBe("#declarations");
    expect(byKey["condamnations-definitives"].tone).toBe("danger");
  });

  it("carries a textual value and never relies on tone alone", () => {
    const signals = buildPoliticianSignals(base);
    for (const s of signals) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.value.length).toBeGreaterThan(0);
    }
  });
});
