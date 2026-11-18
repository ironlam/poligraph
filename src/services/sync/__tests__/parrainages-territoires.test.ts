import { describe, expect, it } from "vitest";
import { DEPARTMENTS } from "@/config/departments";
import {
  buildTerritoryIndex,
  normalizeTerritoryName,
  resolveParrainageTerritory,
  summarizeTerritoryResolutions,
} from "../parrainages-territoires";

const COMMUNES = [
  { id: "02524", name: "Mont-Saint-Père", departmentCode: "02" },
  { id: "05131", name: "Saint-Auban-d'Oze", departmentCode: "05" },
  { id: "52332", name: "Val-de-Meuse", departmentCode: "52" },
  { id: "51410", name: "Œuilly", departmentCode: "51" },
  { id: "98809", name: "L'Île-des-Pins", departmentCode: "988" },
  { id: "42218", name: "Saint-Étienne", departmentCode: "42" },
  // Same name in another department: must never answer for the Savoie row below.
  { id: "06128", name: "Saint-Paul", departmentCode: "06" },
  // Two communes of one department folding to the same key (fictitious pair).
  { id: "01901", name: "Saint-Exemple", departmentCode: "01" },
  { id: "01902", name: "Saint Exemple", departmentCode: "01" },
];
const index = buildTerritoryIndex(DEPARTMENTS, COMMUNES);

const maire = (constituencyLabel: string, departmentLabel: string) =>
  resolveParrainageTerritory({ mandat: "MAIRE", constituencyLabel, departmentLabel }, index);

describe("normalizeTerritoryName", () => {
  it("replie la casse, les accents, les ligatures, les tirets et les apostrophes", () => {
    expect(normalizeTerritoryName("Saint-Auban-d'Oze")).toBe("saint auban d oze");
    expect(normalizeTerritoryName("SAINT AUBAN D’OZE")).toBe("saint auban d oze");
    expect(normalizeTerritoryName("Œuilly")).toBe("oeuilly");
    expect(normalizeTerritoryName("  Côte-d'Or ")).toBe("cote d or");
  });

  it("remet devant le nom un article écrit après lui", () => {
    expect(normalizeTerritoryName("Île-des-Pins (L')")).toBe("l ile des pins");
    expect(normalizeTerritoryName("Havre (Le)")).toBe(normalizeTerritoryName("Le Havre"));
    expect(normalizeTerritoryName("Rochelle (La)")).toBe("la rochelle");
  });

  it("ne retire aucun article : La Longeville et Longeville restent deux noms", () => {
    expect(normalizeTerritoryName("La Longeville")).not.toBe(normalizeTerritoryName("Longeville"));
  });
});

describe("resolveParrainageTerritory, département", () => {
  it("résout par nom exact, sans confondre Loire, Loiret et Loir-et-Cher", () => {
    expect(maire("", "Loire").departmentCode).toBe("42");
    expect(maire("", "Loiret").departmentCode).toBe("45");
    expect(maire("", "Loir-et-Cher").departmentCode).toBe("41");
  });

  it("accepte une graphie sans tirets", () => {
    expect(maire("", "Wallis et Futuna")).toMatchObject({
      departmentCode: "986",
      departmentStatus: "RESOLVED",
    });
  });

  it("laisse non résolu un libellé qui couvre deux collectivités", () => {
    expect(maire("", "Saint-Martin / Saint-Barthélémy")).toMatchObject({
      departmentCode: null,
      departmentStatus: "NOT_FOUND",
    });
  });

  it("classe à part les libellés qui ne sont pas un territoire", () => {
    for (const label of ["Parlement européen", "Français de l'étranger"]) {
      expect(maire("", label)).toEqual({
        departmentCode: null,
        departmentStatus: "NOT_APPLICABLE",
        communeCode: null,
        communeStatus: "NOT_APPLICABLE",
      });
    }
  });
});

describe("resolveParrainageTerritory, commune", () => {
  it("résout la commune d'un maire dans son département", () => {
    expect(maire("Mont-Saint-Père", "Aisne")).toEqual({
      departmentCode: "02",
      departmentStatus: "RESOLVED",
      communeCode: "02524",
      communeStatus: "RESOLVED",
    });
    expect(maire("Saint-Auban-d'Oze", "Hautes-Alpes").communeCode).toBe("05131");
    expect(maire("Île-des-Pins (L')", "Nouvelle-Calédonie").communeCode).toBe("98809");
    expect(maire("SAINT ETIENNE", "Loire").communeCode).toBe("42218");
  });

  it("résout la commune d'un maire délégué", () => {
    const resolution = resolveParrainageTerritory(
      {
        mandat: "MAIRE_DELEGUE",
        constituencyLabel: "Val-de-Meuse",
        departmentLabel: "Haute-Marne",
      },
      index
    );
    expect(resolution.communeCode).toBe("52332");
  });

  it("ne va pas chercher un homonyme dans un autre département", () => {
    expect(maire("Saint-Paul", "Savoie")).toMatchObject({
      departmentCode: "73",
      communeCode: null,
      communeStatus: "NOT_FOUND",
    });
  });

  it("ne choisit pas entre deux communes du même nom", () => {
    expect(maire("Saint-Exemple", "Ain")).toMatchObject({
      departmentCode: "01",
      communeCode: null,
      communeStatus: "AMBIGUOUS",
    });
  });

  it("ne cherche pas de commune sans département résolu", () => {
    expect(maire("Saint-Paul", "Savoie-du-Nord")).toMatchObject({
      departmentStatus: "NOT_FOUND",
      communeCode: null,
      communeStatus: "NOT_FOUND",
    });
  });

  it("ne lit pas la circonscription d'un autre mandat comme une commune", () => {
    for (const mandat of ["DEPUTE", "SENATEUR", "CONSEILLER_REGIONAL", "PRESIDENT_EPCI"] as const) {
      const resolution = resolveParrainageTerritory(
        { mandat, constituencyLabel: "Saint-Étienne", departmentLabel: "Loire" },
        index
      );
      expect(resolution).toMatchObject({
        departmentCode: "42",
        communeCode: null,
        communeStatus: "NOT_APPLICABLE",
      });
    }
    expect(
      resolveParrainageTerritory(
        { mandat: null, constituencyLabel: "Saint-Étienne", departmentLabel: "Loire" },
        index
      ).communeStatus
    ).toBe("NOT_APPLICABLE");
  });
});

describe("summarizeTerritoryResolutions", () => {
  it("compte chaque verdict par niveau", () => {
    const report = summarizeTerritoryResolutions([
      maire("Mont-Saint-Père", "Aisne"),
      maire("Saint-Paul", "Savoie"),
      maire("Saint-Exemple", "Ain"),
      maire("", "Parlement européen"),
    ]);
    expect(report).toEqual({
      department: { RESOLVED: 3, AMBIGUOUS: 0, NOT_FOUND: 0, NOT_APPLICABLE: 1 },
      commune: { RESOLVED: 1, AMBIGUOUS: 1, NOT_FOUND: 1, NOT_APPLICABLE: 1 },
    });
  });
});
