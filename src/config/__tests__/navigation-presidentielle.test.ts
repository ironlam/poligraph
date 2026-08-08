import { describe, it, expect } from "vitest";
import { FOOTER_SECTIONS, NAV_ELECTIONS, NAV_SECONDARY } from "@/config/navigation";

const HUB = "/elections/presidentielle-2027";
const SENATORIALES = "/elections/senatoriales-2026";
const MUNICIPALES = "/elections/municipales-2026";

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

  it("lists upcoming elections before past ones", () => {
    const firstPast = NAV_ELECTIONS.findIndex((i) => i.past);
    const lastUpcoming = NAV_ELECTIONS.map((i) => Boolean(i.past)).lastIndexOf(false);
    expect(firstPast).toBeGreaterThan(lastUpcoming);
  });

  it("marks the 2026 municipal election as past", () => {
    expect(NAV_ELECTIONS.find((i) => i.href === MUNICIPALES)?.past).toBe(true);
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
