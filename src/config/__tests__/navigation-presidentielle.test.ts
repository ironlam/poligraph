import { describe, it, expect } from "vitest";
import { FOOTER_SECTIONS, NAV_ELECTIONS, NAV_SECONDARY } from "@/config/navigation";

const HUB = "/elections/presidentielle-2027";
const SENATORIALES = "/elections/senatoriales-2026";

const footerHrefs = FOOTER_SECTIONS.flatMap((s) => s.links.map((l) => l.href));

describe("nav élections", () => {
  it("points at the presidential hub", () => {
    const e = NAV_ELECTIONS.find((i) => i.href === HUB);
    expect(e).toBeDefined();
    expect(e?.label).toBe("Présidentielle 2027");
  });

  it("points at the 2026 senatorial election", () => {
    const e = NAV_ELECTIONS.find((i) => i.href === SENATORIALES);
    expect(e).toBeDefined();
    expect(e?.label).toBe("Sénatoriales 2026");
  });

  /**
   * `getPastElectionSlugs` queries Election.slug with these values. A slug that does not match its
   * own href matches no row, so the entry would silently stay "À venir" forever: the exact failure
   * the database lookup exists to prevent.
   */
  it("keeps each slug in step with its href", () => {
    for (const item of NAV_ELECTIONS) {
      expect(item.href).toBe(`/elections/${item.slug}`);
    }
  });

  it("carries no hardcoded temporal state", () => {
    for (const item of NAV_ELECTIONS) {
      expect(item).not.toHaveProperty("past");
      expect(item).not.toHaveProperty("when");
    }
  });

  it("surfaces every election in the footer", () => {
    for (const item of NAV_ELECTIONS) {
      expect(footerHrefs).toContain(item.href);
    }
  });

  it("does not duplicate elections in the secondary pills", () => {
    const electionHrefs = new Set(NAV_ELECTIONS.map((i) => i.href));
    const duplicated = NAV_SECONDARY.filter((i) => electionHrefs.has(i.href));
    expect(duplicated).toEqual([]);
  });
});
