import { describe, it, expect } from "vitest";
import { computeCommuneCollege, inhabitantsPerDelegate } from "../college";

// Real production rows, so the arithmetic stays anchored to what the page will read.
const BORDEAUX = { communeId: "33063", population: 267991, totalSeats: 65 };
const BAZAS = { communeId: "33036", population: 4854, totalSeats: 27 };
const PARIS = { communeId: "75056", population: 2103778, totalSeats: 69 };
const LYON = { communeId: "69123", population: 519127, totalSeats: 69 };
const MARSEILLE = { communeId: "13055", population: 886040, totalSeats: 69 };

describe("computeCommuneCollege : régime de l'article L. 285", () => {
  it("Bordeaux : 65 délégués de droit plus 297 tranches de 800 au-delà de 30 000", () => {
    const college = computeCommuneCollege(BORDEAUX);
    expect(college).not.toBeNull();
    expect(college!.regime).toBe("by-right");
    expect(college!.delegatesByRight).toBe(65);
    // (267 991 − 30 000) / 800 = 297,49 donc 297 tranches complètes
    expect(college!.supplementaryBrackets).toBe(297);
    expect(college!.total).toBe(362);
    expect(college!.scaleDelegates).toBeNull();
  });

  it("ne compte aucun délégué supplémentaire entre 9 000 et 30 000 habitants", () => {
    const college = computeCommuneCollege({
      communeId: "00001",
      population: 25000,
      totalSeats: 33,
    });
    expect(college!.regime).toBe("by-right");
    expect(college!.delegatesByRight).toBe(33);
    expect(college!.supplementaryDelegates).toBe(0);
    expect(college!.total).toBe(33);
  });

  it("bascule sous le régime des délégués de droit dès 9 000 habitants pile", () => {
    const college = computeCommuneCollege({ communeId: "00002", population: 9000, totalSeats: 29 });
    expect(college!.regime).toBe("by-right");
    expect(college!.total).toBe(29);
  });

  it("ne compte que les tranches complètes, jamais la tranche entamée", () => {
    // 30 799 : une tranche entamée mais incomplète
    expect(
      computeCommuneCollege({ communeId: "x", population: 30799, totalSeats: 35 })!.total
    ).toBe(35);
    // 30 800 : première tranche complète
    expect(
      computeCommuneCollege({ communeId: "x", population: 30800, totalSeats: 35 })!.total
    ).toBe(36);
  });
});

describe("computeCommuneCollege : barème de l'article L. 284", () => {
  it("Bazas : un conseil de 27 membres désigne 15 délégués", () => {
    const college = computeCommuneCollege(BAZAS);
    expect(college!.regime).toBe("scale");
    expect(college!.scaleDelegates).toBe(15);
    expect(college!.total).toBe(15);
    expect(college!.delegatesByRight).toBeNull();
  });

  it("applique le barème sur la taille du conseil, pas sur la population", () => {
    const cas: Array<[number, number]> = [
      [7, 1],
      [11, 1],
      [15, 3],
      [19, 5],
      [23, 7],
      [27, 15],
      [29, 15],
    ];
    for (const [seats, delegates] of cas) {
      const college = computeCommuneCollege({ communeId: "x", population: 800, totalSeats: seats });
      expect(college!.total, `conseil de ${seats}`).toBe(delegates);
    }
  });
});

describe("computeCommuneCollege : dérogation PLM", () => {
  it("Paris compte 163 conseillers, pas les 69 du barème générique", () => {
    const college = computeCommuneCollege(PARIS);
    expect(college!.councilSeats).toBe(163);
    // 163 + ⌊(2 103 778 − 30 000) / 800⌋ = 163 + 2592
    expect(college!.total).toBe(2755);
  });

  it("Lyon compte 73 conseillers", () => {
    const college = computeCommuneCollege(LYON);
    expect(college!.councilSeats).toBe(73);
    expect(college!.total).toBe(73 + Math.floor((519127 - 30000) / 800));
  });

  it("Marseille compte 111 conseillers depuis le renouvellement de 2026", () => {
    const college = computeCommuneCollege(MARSEILLE);
    expect(college!.councilSeats).toBe(111);
    expect(college!.total).toBe(111 + Math.floor((886040 - 30000) / 800));
  });

  it("la dérogation change bien le résultat par rapport au barème brut", () => {
    const avec = computeCommuneCollege(PARIS)!.total;
    const sans = computeCommuneCollege({ ...PARIS, communeId: "99999" })!.total;
    expect(avec).toBeGreaterThan(sans);
    expect(avec - sans).toBe(163 - 69);
  });
});

describe("computeCommuneCollege : absences", () => {
  it("ne calcule rien sans population", () => {
    expect(computeCommuneCollege({ communeId: "x", population: null, totalSeats: 27 })).toBeNull();
  });

  it("ne calcule rien sans taille de conseil", () => {
    expect(
      computeCommuneCollege({ communeId: "x", population: 4854, totalSeats: null })
    ).toBeNull();
  });

  it("refuse une taille de conseil hors barème plutôt que d'inventer un nombre", () => {
    // 33 sièges sous 9 000 habitants n'existe pas au barème CGCT : défaut de donnée.
    expect(computeCommuneCollege({ communeId: "x", population: 4000, totalSeats: 33 })).toBeNull();
  });

  it("refuse des valeurs négatives ou nulles", () => {
    expect(computeCommuneCollege({ communeId: "x", population: -1, totalSeats: 27 })).toBeNull();
    expect(computeCommuneCollege({ communeId: "x", population: 4000, totalSeats: 0 })).toBeNull();
  });
});

describe("inhabitantsPerDelegate", () => {
  it("montre l'écart de poids entre Bordeaux et Bazas", () => {
    const bordeaux = inhabitantsPerDelegate(computeCommuneCollege(BORDEAUX))!;
    const bazas = inhabitantsPerDelegate(computeCommuneCollege(BAZAS))!;
    expect(Math.round(bordeaux)).toBe(740);
    expect(Math.round(bazas)).toBe(324);
    expect(bordeaux / bazas).toBeGreaterThan(2);
  });

  it("propage l'absence", () => {
    expect(inhabitantsPerDelegate(null)).toBeNull();
  });
});
