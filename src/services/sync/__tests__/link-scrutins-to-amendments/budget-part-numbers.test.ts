import { describe, it, expect } from "vitest";
import {
  budgetPartNumbers,
  parseArticleTarget,
} from "@/services/sync/link-scrutins-to-amendments/parse-title";

describe("budgetPartNumbers", () => {
  it("maps a bare title number to both finance-bill parts", () => {
    expect(budgetPartNumbers("1358")).toEqual(["I-1358", "II-1358"]);
  });

  it("leaves already-prefixed and committee numbers alone", () => {
    expect(budgetPartNumbers("I-1358")).toEqual([]);
    expect(budgetPartNumbers("II-CF711")).toEqual([]);
    expect(budgetPartNumbers("CF12")).toEqual([]);
  });
});

describe("parseArticleTarget", () => {
  it("reads the same target from a vote title and from the amendment article field", () => {
    expect(
      parseArticleTarget(
        "l'amendement n° 1025 de M. Pilato après l'article 15 (examen prioritaire)"
      )
    ).toEqual({ position: "after", article: "15" });
    expect(parseArticleTarget("APRÈS L'ARTICLE 15, insérer l'article suivant:")).toEqual({
      position: "after",
      article: "15",
    });
    expect(parseArticleTarget("l'amendement n° 18 de M. Delautrette à l'article 34")).toEqual({
      position: "at",
      article: "34",
    });
    expect(parseArticleTarget("ARTICLE 34")).toEqual({ position: "at", article: "34" });
    expect(parseArticleTarget("AVANT L'ARTICLE 58")).toEqual({ position: "before", article: "58" });
  });

  it("keeps a Latin suffix and tolerates a double space", () => {
    expect(parseArticleTarget("après  l'article 10 bis du projet")).toEqual({
      position: "after",
      article: "10 bis",
    });
  });

  it("distinguishes the article from its neighbours", () => {
    expect(parseArticleTarget("ARTICLE 15")).not.toEqual(parseArticleTarget("ARTICLE 150"));
    expect(parseArticleTarget("ARTICLE 15")).not.toEqual(parseArticleTarget("APRÈS L'ARTICLE 15"));
  });

  it("returns null without a numbered article", () => {
    expect(parseArticleTarget(null)).toBeNull();
    expect(parseArticleTarget("l'amendement n° 12 de M. Dupont")).toBeNull();
  });
});
