import { describe, it, expect } from "vitest";
import { normalizeTitle, tokenize, billPhrase, jaccard } from "../text";

describe("text helpers", () => {
  it("normalizes accents, apostrophes and hyphens", () => {
    expect(normalizeTitle("l'Égalité aux Aéronefs télépilotés")).toBe(
      "l egalite aux aeronefs telepilotes"
    );
  });

  it("extracts the bill phrase after 'proposition de loi'", () => {
    const t =
      "l'amendement n° 6 de Mme Panot à l'article premier de la proposition de loi contre toutes les fraudes aux aides publiques (première lecture).";
    expect(billPhrase(t)).toBe("contre toutes les fraudes aux aides publiques");
  });

  it("returns null when no bill phrase is present", () => {
    expect(billPhrase("la motion de rejet préalable")).toBeNull();
  });

  it("tokenize drops stopwords and short tokens", () => {
    expect([...tokenize("Contre toutes les fraudes aux aides publiques")]).toEqual([
      "fraudes",
      "aides",
      "publiques",
    ]);
  });

  it("jaccard of disjoint sets is 0, identical is 1", () => {
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });
});

/**
 * `normalizeTitle` alimente le score de rapprochement scrutin/dossier. Le motif aveugle
 * `<[^>]+>` supprimait tout ce qui sépare deux opérateurs, donc les mots du milieu ne
 * parvenaient jamais à `tokenize` et le lien se perdait sans bruit.
 */
describe("normalizeTitle et les comparaisons chiffrées", () => {
  it("garde les mots situés entre deux opérateurs", () => {
    const tokens = tokenize(normalizeTitle("Seuil de déficit < 3 % et dette > 100 %"));
    expect(tokens).toContain("deficit");
    expect(tokens).toContain("dette");
  });

  it("retire toujours les balises", () => {
    expect(normalizeTitle("<p>Loi de <b>finances</b></p>")).toBe("loi de finances");
  });
});
