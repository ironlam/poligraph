import { describe, expect, it } from "vitest";
import type { MunicipalesListe } from "@/lib/data/territoires";
import { compositionConseil, siegesEnMots } from "../composition-conseil";

function liste(
  listName: string | null,
  tete: string,
  sieges: number | null,
  round2Pct: number | null = null
): MunicipalesListe {
  return {
    listName,
    teteDeListe: { name: tete, person: null },
    sieges,
    round2Pct,
  } as MunicipalesListe;
}

describe("compositionConseil", () => {
  it("ne dit rien quand aucun siège n'est connu", () => {
    expect(compositionConseil([liste("A", "Anne Martin", null)])).toBeNull();
    expect(compositionConseil([])).toBeNull();
  });

  it("classe les listes par sièges et laisse de côté celles qui n'en ont pas", () => {
    const composition = compositionConseil([
      liste("Liste B", "Paul Durand", 5),
      liste("Liste C", "Lina Roy", 0),
      liste("Liste A", "Anne Martin", 28),
    ]);
    expect(composition).toEqual({
      total: 33,
      parts: [
        { label: "Liste A", sieges: 28, ton: 0 },
        { label: "Liste B", sieges: 5, ton: 1 },
      ],
    });
  });

  // A list merged between the rounds may be recorded under its first-round name.
  it("nomme la liste par sa tête de liste dans une commune décidée au second tour", () => {
    const composition = compositionConseil([
      liste("Nom du premier tour", "Anne Martin", 44, 52.1),
      liste("Liste B", "Paul Durand", 11, 30),
      liste("Liste éliminée", "Lina Roy", null),
    ]);
    expect(composition?.parts.map((p) => p.label)).toEqual([
      "Liste conduite par Anne Martin",
      "Liste conduite par Paul Durand",
    ]);
  });

  it("nomme par sa tête de liste une liste sans nom", () => {
    expect(compositionConseil([liste(null, "Anne Martin", 7)])?.parts[0]?.label).toBe(
      "Liste conduite par Anne Martin"
    );
  });

  it("réunit les listes au-delà de trois, sans perdre un siège", () => {
    const composition = compositionConseil([
      liste("A", "a", 42),
      liste("B", "b", 5),
      liste("C", "c", 4),
      liste("D", "d", 3),
      liste("E", "e", 1),
    ]);
    expect(composition?.parts.at(-1)).toEqual({
      label: "2 autres listes",
      sieges: 4,
      ton: "autres",
    });
    expect(composition?.total).toBe(55);
    expect(
      compositionConseil([
        liste("A", "a", 9),
        liste("B", "b", 3),
        liste("C", "c", 2),
        liste("D", "d", 1),
      ])?.parts.at(-1)?.label
    ).toBe("1 autre liste");
  });
});

describe("siegesEnMots", () => {
  it("accorde le mot siège", () => {
    expect(siegesEnMots(1)).toBe("1 siège");
    expect(siegesEnMots(44)).toBe("44 sièges");
  });
});
