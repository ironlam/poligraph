import { describe, it, expect } from "vitest";
import { accentInsensitivePattern, scrutinSearchTokens } from "@/lib/votes/scrutin-search";

const matches = (word: string, text: string) =>
  new RegExp(accentInsensitivePattern(word), "i").test(text);

describe("scrutinSearchTokens", () => {
  it("découpe en mots, sans doublon ni lettre isolée", () => {
    expect(scrutinSearchTokens("  Retraite 64 ans  a retraite ")).toEqual([
      "retraite",
      "64",
      "ans",
    ]);
  });

  it("garde un chiffre seul et plafonne le nombre de mots", () => {
    expect(scrutinSearchTokens("article 4")).toEqual(["article", "4"]);
    expect(scrutinSearchTokens("un deux trois quatre cinq six sept huit neuf dix")).toHaveLength(8);
  });
});

describe("accentInsensitivePattern", () => {
  it("trouve un mot avec ou sans accents, en majuscules comprises", () => {
    expect(matches("securite", "Projet de loi relatif à la Sécurité")).toBe(true);
    expect(matches("sécurité", "SECURITE INTERIEURE")).toBe(true);
    expect(matches("ÉLÈVES", "les élèves")).toBe(true);
  });

  it("cherche les caractères spéciaux littéralement", () => {
    expect(matches("49.3", "article 49.3 de la Constitution")).toBe(true);
    expect(matches("49.3", "article 4913")).toBe(false);
    expect(matches("50%", "baisse de 50%")).toBe(true);
    expect(matches("(a)", "x a y")).toBe(false);
  });
});
