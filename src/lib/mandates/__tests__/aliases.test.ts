import { describe, expect, it } from "vitest";

import { nextAliases } from "@/lib/mandates/aliases";

describe("nextAliases", () => {
  it("retient le nom du registre quand il diffère de celui de la fiche", () => {
    // Karine Paret en base, Karine Palle au registre : c'est la même personne, et elle doit
    // être trouvable sous les deux. La fiche garde son nom, l'autre devient un alias.
    expect(nextAliases({ fullName: "Karine Paret", aliases: [] }, "Karine Palle")).toEqual([
      "Karine Palle",
    ]);
  });

  it("ne retient rien quand c'est le même nom écrit autrement", () => {
    // Accents et casse ne font pas un autre nom. Les retenir remplirait la colonne de bruit.
    expect(nextAliases({ fullName: "Éric Ciotti", aliases: [] }, "ERIC CIOTTI")).toBeNull();
    expect(
      nextAliases({ fullName: "Jean-Marie Dupont", aliases: [] }, "Jean Marie Dupont")
    ).toBeNull();
  });

  it("n'ajoute pas deux fois le même alias", () => {
    // Le sync repasse sur les mêmes lignes à chaque run : sans ça, la liste enflerait.
    expect(
      nextAliases({ fullName: "Karine Paret", aliases: ["Karine Palle"] }, "Karine Palle")
    ).toBeNull();
    expect(
      nextAliases({ fullName: "Karine Paret", aliases: ["KARINE PALLE"] }, "Karine Palle")
    ).toBeNull();
  });

  it("empile un second alias sans perdre le premier", () => {
    expect(
      nextAliases({ fullName: "Karine Paret", aliases: ["Karine Palle"] }, "Karine Dubois")
    ).toEqual(["Karine Palle", "Karine Dubois"]);
  });

  it("ignore un nom vide", () => {
    expect(nextAliases({ fullName: "Karine Paret", aliases: [] }, "   ")).toBeNull();
  });
});
