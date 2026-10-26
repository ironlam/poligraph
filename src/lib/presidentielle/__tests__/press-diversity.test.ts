import { describe, expect, it } from "vitest";
import { keepArticlesCitingNewCandidates } from "../press-diversity";

const article = (id: string, candidateIds: string[]) => ({ id, candidateIds });

describe("keepArticlesCitingNewCandidates", () => {
  it("écarte un article dont tous les candidats sont déjà cités", () => {
    const articles = [
      article("1", ["A"]),
      article("2", ["A"]),
      article("3", ["A", "B"]),
      article("4", ["B"]),
      article("5", ["C"]),
    ];
    expect(keepArticlesCitingNewCandidates(articles, 3).map((a) => a.id)).toEqual(["1", "3", "5"]);
  });

  it("s'arrête à la limite", () => {
    const articles = [article("1", ["A"]), article("2", ["B"]), article("3", ["C"])];
    expect(keepArticlesCitingNewCandidates(articles, 2).map((a) => a.id)).toEqual(["1", "2"]);
  });

  it("écarte un article sans candidat cité", () => {
    expect(keepArticlesCitingNewCandidates([article("1", [])], 3)).toEqual([]);
  });
});
