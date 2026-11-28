import { describe, expect, it } from "vitest";
import type { MotionsDeCensureData } from "@/lib/data/motions-de-censure";
import {
  groupDeputiesByCount,
  legislatureLabel,
  pageDescription,
  pageTitle,
  resultLabel,
  votesForLabel,
} from "../page-text";

const motion = (date: string) => ({
  slug: date,
  title: "t",
  votingDate: new Date(`${date}T00:00:00.000Z`),
  legislature: 17,
  votesFor: 1,
  requiredMajority: 289,
  adopted: false,
  article: null,
  government: null,
  sourceUrl: null,
});

const data: MotionsDeCensureData = {
  total: 57,
  adopted: 1,
  legislatures: [
    { legislature: 17, motions: [motion("2026-07-06")], groups: [], deputies: [] },
    { legislature: 16, motions: [motion("2022-07-11")], groups: [], deputies: [] },
  ],
};

describe("motions de censure, libellés", () => {
  it("chiffre le titre et date le début de la série", () => {
    expect(pageTitle(data)).toBe(
      "Motions de censure : 57 votes à l'Assemblée depuis 2022, 1 adoptée"
    );
    expect(pageTitle({ ...data, adopted: 2 })).toMatch(/2 adoptées$/);
  });

  it("décrit le contenu sans adjectif et cite la source", () => {
    expect(pageDescription(data)).toBe(
      "Les 57 motions de censure votées à l'Assemblée nationale depuis 2022 : voix pour, majorité requise, gouvernement visé et résultat, puis le détail par groupe et par député. Chiffres de l'Assemblée nationale."
    );
  });

  it("rapporte les voix à la majorité requise", () => {
    expect(votesForLabel({ votesFor: 331, requiredMajority: 288 })).toBe(
      "331 voix pour sur 288 requises"
    );
    expect(votesForLabel({ votesFor: 1, requiredMajority: null })).toBe("1 voix pour");
  });

  it("reprend la formule de l'Assemblée pour le résultat", () => {
    expect(resultLabel(true)).toBe("Adoptée");
    expect(resultLabel(false)).toBe("Non adoptée");
  });

  it("écrit la législature en chiffres romains", () => {
    expect(legislatureLabel(17)).toBe("XVIIe législature");
    expect(legislatureLabel(16)).toBe("XVIe législature");
  });
});

describe("groupDeputiesByCount", () => {
  it("regroupe les égalités, du plus grand nombre au plus petit, sans réordonner les noms", () => {
    const groups = groupDeputiesByCount([
      { slug: "b", count: 17 },
      { slug: "a", count: 3 },
      { slug: "c", count: 17 },
    ]);
    expect(groups.map((g) => [g.count, g.deputies.map((d) => d.slug)])).toEqual([
      [17, ["b", "c"]],
      [3, ["a"]],
    ]);
  });
});
