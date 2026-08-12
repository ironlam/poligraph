import { describe, expect, it } from "vitest";
import { getGroupAttributionCoverage } from "../group-exposure";

describe("couverture de l'attribution des sièges aux groupes", () => {
  it("laisse un siège vacant non attribué", () => {
    expect(getGroupAttributionCoverage([{ atStake: 100 }, { atStake: 77 }], 178)).toEqual({
      unattributedAtStake: 1,
      isConsistent: true,
    });
  });

  it("n'invente pas de groupe quand aucun mandat n'est disponible", () => {
    expect(getGroupAttributionCoverage([], 178)).toEqual({
      unattributedAtStake: 178,
      isConsistent: true,
    });
  });

  it("signale un dépassement au lieu de masquer des mandats dupliqués", () => {
    expect(getGroupAttributionCoverage([{ atStake: 179 }], 178)).toEqual({
      unattributedAtStake: 0,
      isConsistent: false,
    });
  });
});
