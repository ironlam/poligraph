import { describe, expect, it } from "vitest";
import { GOVERNMENT_CATALOG, governmentSlugForLegacyName } from "../catalog";

describe("catalogue des gouvernements", () => {
  it("compte 48 slugs uniques", () => {
    expect(GOVERNMENT_CATALOG).toHaveLength(48);
    expect(new Set(GOVERNMENT_CATALOG.map((g) => g.slug)).size).toBe(48);
  });

  it("numérote de 1 à 48 sans trou, dans l'ordre", () => {
    expect(GOVERNMENT_CATALOG.map((g) => g.sequence)).toEqual(
      Array.from({ length: 48 }, (_, i) => i + 1)
    );
    expect(GOVERNMENT_CATALOG[0]?.slug).toBe("debre");
    expect(GOVERNMENT_CATALOG[47]?.slug).toBe("lecornu-2");
  });

  it("n'attribue aucun libellé à deux gouvernements", () => {
    const all = GOVERNMENT_CATALOG.flatMap((g) => g.legacyNames);
    expect(new Set(all).size).toBe(all.length);
  });

  it("rattache les deux libellés de Valls à valls-1", () => {
    expect(governmentSlugForLegacyName("Gouvernement Manuel Valls")).toBe("valls-1");
    expect(governmentSlugForLegacyName("Gouvernement Manuel Valls n°1")).toBe("valls-1");
    expect(governmentSlugForLegacyName("Gouvernement Manuel Valls n°2")).toBe("valls-2");
  });

  it("garde l'orthographe sans accent de « Edouard » en production", () => {
    expect(governmentSlugForLegacyName("Gouvernement Edouard Philippe n°2")).toBe("philippe-2");
    expect(governmentSlugForLegacyName("Gouvernement Édouard Philippe n°2")).toBeNull();
    expect(governmentSlugForLegacyName("Gouvernement Édouard Balladur")).toBe("balladur");
  });

  it("ignore les espaces de bord mais aucune autre variante", () => {
    expect(governmentSlugForLegacyName("  Gouvernement Jean Castex ")).toBe("castex");
    expect(governmentSlugForLegacyName("gouvernement jean castex")).toBeNull();
    expect(governmentSlugForLegacyName("Gouvernement Inconnu")).toBeNull();
    expect(governmentSlugForLegacyName("")).toBeNull();
  });

  it("ne rattache jamais le libellé Lecornu fusionné", () => {
    expect(governmentSlugForLegacyName("Gouvernement Sébastien Lecornu")).toBeNull();
    expect(GOVERNMENT_CATALOG.filter((g) => g.slug.startsWith("lecornu"))).toHaveLength(2);
    for (const g of GOVERNMENT_CATALOG.filter((x) => x.slug.startsWith("lecornu"))) {
      expect(g.legacyNames).toEqual([]);
    }
  });

  it("nomme les gouvernements numérotés avec un chiffre romain", () => {
    const bySlug = Object.fromEntries(GOVERNMENT_CATALOG.map((g) => [g.slug, g.name]));
    expect(bySlug["debre"]).toBe("Gouvernement Michel Debré");
    expect(bySlug["chirac-1"]).toBe("Gouvernement Jacques Chirac I");
    expect(bySlug["chirac-2"]).toBe("Gouvernement Jacques Chirac II");
    expect(bySlug["philippe-2"]).toBe("Gouvernement Édouard Philippe II");
    expect(bySlug["lecornu-2"]).toBe("Gouvernement Sébastien Lecornu II");
  });
});
