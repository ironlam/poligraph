import { describe, expect, it } from "vitest";
import {
  censureArticle,
  isCensureSearch,
  governmentAt,
  requiredMajority,
  seatsFilled,
  type GovernmentPeriod,
} from "@/lib/votes/motions-de-censure";

describe("requiredMajority", () => {
  it("vaut 289 avec les 577 sièges pourvus", () => {
    expect(requiredMajority([300, 200, 77])).toBe(289);
  });

  it("baisse avec les sièges vacants, comme le publie l'Assemblée", () => {
    // Values of nbrSuffragesRequis in the AN open data: 288 for 574 or 575 members, 287 for 573.
    expect(requiredMajority([575])).toBe(288);
    expect(requiredMajority([574])).toBe(288);
    expect(requiredMajority([573])).toBe(287);
  });

  // Review of #1481: a missing count read as zero published "151 requises" for [300, null].
  it("renvoie null dès qu'un groupe n'a pas d'effectif, plutôt qu'un seuil trop bas", () => {
    expect(requiredMajority([300, null])).toBeNull();
    expect(seatsFilled([300, null])).toBeNull();
    expect(requiredMajority([])).toBeNull();
    expect(requiredMajority([0])).toBeNull();
  });
});

describe("censureArticle", () => {
  it("lit l'alinéa dans le titre officiel", () => {
    expect(
      censureArticle(
        "la motion de censure déposée en application de l'article 49, alinéa 3, de la Constitution par M. X"
      )
    ).toBe("49-3");
    expect(
      censureArticle(
        "la motion de censure, déposée en application de l'article 49, alinéa 2, de la Constitution"
      )
    ).toBe("49-2");
  });

  it("renvoie null quand le titre ne cite pas l'article", () => {
    expect(censureArticle("la motion de censure de M. X")).toBeNull();
  });
});

describe("governmentAt", () => {
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const governments: GovernmentPeriod[] = [
    { slug: "barnier", name: "Gouvernement Michel Barnier", appointedAt: d("2024-09-05") },
    { slug: "bayrou", name: "Gouvernement François Bayrou", appointedAt: d("2024-12-13") },
    { slug: "attal", name: "Gouvernement Gabriel Attal", appointedAt: d("2024-01-09") },
  ];

  it("retient le dernier Premier ministre nommé avant le vote, même si les périodes se chevauchent", () => {
    expect(governmentAt(d("2024-12-04"), governments)?.slug).toBe("barnier");
    expect(governmentAt(d("2025-01-16"), governments)?.slug).toBe("bayrou");
  });

  it("compte le jour même de la nomination", () => {
    expect(governmentAt(d("2024-12-13"), governments)?.slug).toBe("bayrou");
  });

  it("renvoie null avant le premier gouvernement connu", () => {
    expect(governmentAt(d("2023-06-01"), governments)).toBeNull();
  });
});

describe("isCensureSearch", () => {
  it("reconnaît une recherche sur la censure, quelle que soit la casse", () => {
    expect(isCensureSearch("motion de censure")).toBe(true);
    expect(isCensureSearch("Censure Barnier")).toBe(true);
    expect(isCensureSearch("censurer le gouvernement")).toBe(true);
  });

  it("ignore les autres recherches et l'absence de recherche", () => {
    expect(isCensureSearch("budget 2026")).toBe(false);
    expect(isCensureSearch("")).toBe(false);
    expect(isCensureSearch(undefined)).toBe(false);
  });
});
