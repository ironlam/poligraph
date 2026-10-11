import { describe, expect, it } from "vitest";
import { FOOTER_SECTIONS, NAV_PRIMARY, NAV_SECONDARY, filterNavItems } from "@/config/navigation";

const ALL_FLAGS = new Set(["STATISTIQUES_SECTION", "PROGRAMMES_ENABLED", "MON_DEPUTE_SECTION"]);

const desktop = (flags: ReadonlySet<string>) =>
  filterNavItems(NAV_PRIMARY, flags)
    .filter((item) => !item.mobileOnly)
    .map((item) => item.label);

const territoires = (flags: ReadonlySet<string>) =>
  filterNavItems(NAV_PRIMARY, flags).find((item) => item.href === "/territoires");

describe("navigation : rubrique Territoires", () => {
  it("donne au desktop six rubriques, Programmes en moins", () => {
    expect(desktop(ALL_FLAGS)).toEqual([
      "Statistiques",
      "Politiques",
      "Territoires",
      "Affaires",
      "Fact-checks",
      "Parlement",
    ]);
  });

  it("affiche Territoires sans drapeau", () => {
    expect(territoires(new Set())).toBeDefined();
  });

  it("garde Programmes dans le menu mobile, sous son drapeau", () => {
    const mobile = (flags: ReadonlySet<string>) =>
      filterNavItems(NAV_PRIMARY, flags).map((item) => item.href);
    expect(mobile(ALL_FLAGS)).toContain("/programmes");
    expect(mobile(new Set())).not.toContain("/programmes");
  });

  it("propose Ma commune, Départements, Régions et Mon député sous Territoires", () => {
    expect(territoires(ALL_FLAGS)?.children?.map((c) => [c.label, c.href])).toEqual([
      ["Ma commune", "/territoires"],
      ["Départements", "/territoires/departements"],
      ["Régions", "/territoires#regions"],
      ["Mon député", "/mon-depute"],
    ]);
  });

  it("garde Mon député derrière son drapeau", () => {
    const hrefs = territoires(new Set())?.children?.map((c) => c.href) ?? [];
    expect(hrefs).not.toContain("/mon-depute");
    expect(hrefs).toContain("/territoires/departements");
  });

  it("ne répète en pastille aucune destination du menu principal", () => {
    const primary = new Set(
      NAV_PRIMARY.flatMap((item) => [item.href, ...(item.children ?? []).map((c) => c.href)])
    );
    expect(NAV_SECONDARY.filter((item) => primary.has(item.href))).toEqual([]);
  });

  it("laisse Programmes atteignable depuis le pied de page", () => {
    const hrefs = FOOTER_SECTIONS.flatMap((s) => s.links.map((l) => l.href));
    expect(hrefs).toContain("/programmes");
  });
});
