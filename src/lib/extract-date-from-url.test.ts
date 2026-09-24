import { describe, it, expect } from "vitest";
import { extractDateFromUrl } from "./extract-date-from-url";

const toDateStr = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

describe("extractDateFromUrl", () => {
  describe("/article/YYYY/MM/DD/ pattern (Le Monde)", () => {
    it("extracts date from Le Monde URL", () => {
      const url =
        "https://www.lemonde.fr/politique/article/2024/03/15/titre-article_1234567_89.html";
      expect(toDateStr(extractDateFromUrl(url))).toBe("2024-03-15");
    });
  });

  describe("/YYYY/MM/DD/ pattern (HuffPost)", () => {
    it("extracts date from HuffPost URL", () => {
      const url = "https://www.huffingtonpost.fr/politique/2024/06/20/titre-article.html";
      expect(toDateStr(extractDateFromUrl(url))).toBe("2024-06-20");
    });

    it("rejects year before 2000", () => {
      const url = "https://example.com/1999/01/01/article.html";
      expect(extractDateFromUrl(url)).toBeNull();
    });

    it("accepts year 2030", () => {
      const url = "https://example.com/2030/12/31/article.html";
      expect(toDateStr(extractDateFromUrl(url))).toBe("2030-12-31");
    });
  });

  describe("-YYYYMMDD_ pattern (Liberation, France24)", () => {
    it("extracts date with underscore separator", () => {
      const url = "https://www.liberation.fr/politique/titre-article-20240315_ABCDEFGH/";
      expect(toDateStr(extractDateFromUrl(url))).toBe("2024-03-15");
    });

    it("extracts date with dash separator", () => {
      const url = "https://www.france24.com/fr/france/20240620-titre-article";
      expect(toDateStr(extractDateFromUrl(url))).toBe("2024-06-20");
    });
  });

  describe("DD-MM-YYYY- pattern (Le Parisien)", () => {
    it("extracts date from Le Parisien URL", () => {
      const url = "https://www.leparisien.fr/politique/15-03-2024-titre-article.php";
      expect(toDateStr(extractDateFromUrl(url))).toBe("2024-03-15");
    });
  });

  describe("/DDMMYY/ pattern (Mediapart old)", () => {
    it("extracts date from old Mediapart URL", () => {
      const url = "https://www.mediapart.fr/journal/france/150324/titre-article";
      expect(toDateStr(extractDateFromUrl(url))).toBe("2024-03-15");
    });

    it("rejects 2-digit year > 30", () => {
      const url = "https://www.mediapart.fr/journal/france/150331/titre";
      expect(extractDateFromUrl(url)).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("returns null for Wikipedia URLs", () => {
      const url = "https://fr.wikipedia.org/wiki/2024/03/15/Politique";
      expect(extractDateFromUrl(url)).toBeNull();
    });

    it("returns null when no pattern matches", () => {
      expect(extractDateFromUrl("https://example.com/no-date-here")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(extractDateFromUrl("")).toBeNull();
    });
  });
});

/**
 * Le garde Wikipedia testait la chaîne entière. Un article de presse dont l'URL cite
 * wikipedia.org dans un paramètre était donc ignoré, et `affair-enrichment` retombait sur
 * `new Date()`, c'est-à-dire la date du jour à la place de la date de publication.
 */
describe("garde Wikipedia", () => {
  it("date un article de presse qui cite wikipedia.org en paramètre", () => {
    const url = "https://www.lemonde.fr/article/2024/03/15/titre_123.html?ref=wikipedia.org";
    expect(toDateStr(extractDateFromUrl(url))).toBe("2024-03-15");
  });

  it("ignore toujours un vrai article Wikipedia", () => {
    expect(extractDateFromUrl("https://fr.wikipedia.org/wiki/2024/03/15/x/")).toBeNull();
  });
});
