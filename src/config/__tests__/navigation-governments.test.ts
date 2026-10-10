import { describe, expect, it } from "vitest";
import { FOOTER_SECTIONS, NAV_PRIMARY, filterNavItems } from "@/config/navigation";

const politiques = (flags: string[]) =>
  filterNavItems(NAV_PRIMARY, new Set(flags)).find((i) => i.href === "/politiques");

describe("navigation : rubrique Gouvernements", () => {
  it("masque les sous-liens de « Politiques » sans le flag", () => {
    const item = politiques([]);
    expect(item).toBeDefined();
    expect(item?.children).toBeUndefined();
  });

  it("affiche Personnes, Gouvernements et Membres avec le flag", () => {
    expect(politiques(["gouvernements"])?.children?.map((c) => [c.label, c.href])).toEqual([
      ["Personnes", "/politiques"],
      ["Gouvernements", "/politiques/gouvernements"],
      ["Membres des gouvernements", "/politiques/gouvernements/membres"],
    ]);
  });

  it("ne change ni l'ordre ni la liste des entrées principales", () => {
    const flags = new Set(["gouvernements", "STATISTIQUES_SECTION", "PROGRAMMES_ENABLED"]);
    expect(filterNavItems(NAV_PRIMARY, flags).map((i) => i.href)).toEqual(
      NAV_PRIMARY.map((i) => i.href)
    );
    expect(filterNavItems(NAV_PRIMARY, new Set()).map((i) => i.href)).toEqual(
      NAV_PRIMARY.filter((i) => !i.featureFlag).map((i) => i.href)
    );
  });

  it("place « Gouvernements » dans la colonne Représentants du footer, derrière le flag", () => {
    const links = FOOTER_SECTIONS.find((s) => s.title === "Représentants")?.links ?? [];
    expect(links.find((l) => l.href === "/politiques/gouvernements")).toEqual({
      href: "/politiques/gouvernements",
      label: "Gouvernements",
      featureFlag: "gouvernements",
    });
  });
});
