import { describe, expect, it } from "vitest";
import { classifyVoteScope } from "../scrutin-scope";

describe("classifyVoteScope", () => {
  it.each([
    "la première partie du projet de loi de finances pour 2027 (première lecture).",
    "l'ensemble de la première partie du projet de loi de finances pour 2027",
    "la seconde partie du projet de loi de financement de la sécurité sociale pour 2026",
    "l’ensemble de la deuxième partie du projet de loi de finances",
  ])("une partie du texte : %s", (title) => {
    expect(classifyVoteScope(title)).toBe("PART");
  });

  it.each([
    "l'ensemble du projet de loi de finances pour 2027 (première lecture).",
    "l'ensemble de la proposition de loi visant à protéger les lanceurs d'alerte",
    "l'ensemble des projets de loi",
  ])("le texte entier : %s", (title) => {
    expect(classifyVoteScope(title)).toBe("WHOLE");
  });

  it("un article", () => {
    expect(classifyVoteScope("l'article 2 du projet de loi de finances pour 2027")).toBe("ARTICLE");
  });

  it("un amendement n'est ni une partie ni le texte entier, même s'il cite l'un des deux", () => {
    expect(
      classifyVoteScope(
        "l'amendement n° 760 de M. Renault à l'article 42 du projet de loi de finances pour 2027"
      )
    ).toBe("OTHER");
    expect(
      classifyVoteScope(
        "l'amendement n° 12 portant sur la première partie du projet de loi de finances"
      )
    ).toBe("OTHER");
  });

  it("une motion ou un titre inconnu", () => {
    expect(
      classifyVoteScope(
        "la motion de censure déposée en application de l'article 49, alinéa 2, de la Constitution"
      )
    ).toBe("OTHER");
    expect(classifyVoteScope("")).toBe("OTHER");
  });

  it("un article cité pour sa procédure constitutionnelle n'est pas un vote d'article", () => {
    expect(
      classifyVoteScope("la déclaration de politique générale, article 49 de la Constitution")
    ).toBe("OTHER");
  });
});
