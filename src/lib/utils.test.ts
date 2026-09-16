import { describe, it, expect } from "vitest";
import {
  cn,
  generateSlug,
  generateAffairSlug,
  generateUniqueSlug,
  generateDateSlug,
  formatDate,
  formatCurrency,
  normalizeImageUrl,
} from "./utils";

describe("cn", () => {
  it("should merge class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("should handle conflicting Tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("should handle conditional classes", () => {
    expect(cn("base", true && "active", false && "hidden")).toBe("base active");
  });

  it("should handle empty inputs", () => {
    expect(cn()).toBe("");
  });
});

describe("normalizeImageUrl", () => {
  it("should return null for null input", () => {
    expect(normalizeImageUrl(null)).toBeNull();
  });

  it("should convert http:// to https://", () => {
    expect(normalizeImageUrl("http://commons.wikimedia.org/photo.jpg")).toBe(
      "https://commons.wikimedia.org/photo.jpg"
    );
  });

  it("should leave https:// URLs unchanged", () => {
    expect(normalizeImageUrl("https://example.com/photo.jpg")).toBe(
      "https://example.com/photo.jpg"
    );
  });

  it("should leave relative URLs unchanged", () => {
    expect(normalizeImageUrl("/images/photo.jpg")).toBe("/images/photo.jpg");
  });
});

describe("generateSlug", () => {
  it("should convert text to lowercase slug", () => {
    expect(generateSlug("Hello World")).toBe("hello-world");
  });

  it("should remove accents", () => {
    expect(generateSlug("François Hollande")).toBe("francois-hollande");
    expect(generateSlug("Éric Coquerel")).toBe("eric-coquerel");
  });

  it("should replace special characters with hyphens", () => {
    expect(generateSlug("L'affaire des emplois fictifs")).toBe("l-affaire-des-emplois-fictifs");
  });

  it("should remove leading and trailing hyphens", () => {
    expect(generateSlug("-test-")).toBe("test");
    expect(generateSlug("  test  ")).toBe("test");
  });

  it("should handle multiple consecutive special characters", () => {
    expect(generateSlug("hello   world")).toBe("hello-world");
    expect(generateSlug("test---slug")).toBe("test-slug");
  });

  it("should handle empty string", () => {
    expect(generateSlug("")).toBe("");
  });
});

describe("generateDateSlug", () => {
  it("should generate date-prefixed slug", () => {
    const date = new Date("2025-12-05");
    expect(generateDateSlug(date, "Hello World")).toBe("2025-12-05-hello-world");
  });

  it("should truncate at word boundary, not mid-word", () => {
    const date = new Date("2025-12-05");
    const longTitle =
      "Emmanuel Macron a-t-il réellement été humilié par les dirigeants étrangers lors du sommet";
    const slug = generateDateSlug(date, longTitle, 80);
    // Should not end with a partial word
    expect(slug).not.toMatch(/-[a-z]$/); // No single-char word remnant at end
    expect(slug.length).toBeLessThanOrEqual(80);
    // Should end at a word boundary (no truncated word)
    expect(slug).toMatch(/-[a-z]{2,}$/);
  });

  it("should not truncate short titles", () => {
    const date = new Date("2025-01-01");
    const slug = generateDateSlug(date, "Test court");
    expect(slug).toBe("2025-01-01-test-court");
  });

  it("should respect custom maxLength", () => {
    const date = new Date("2025-06-15");
    const slug = generateDateSlug(date, "Un titre assez long pour tester la troncature", 40);
    expect(slug.length).toBeLessThanOrEqual(40);
  });

  it("should default to 120 max length", () => {
    const date = new Date("2025-01-01");
    const veryLongTitle = "a".repeat(200);
    const slug = generateDateSlug(date, veryLongTitle);
    expect(slug.length).toBeLessThanOrEqual(120);
  });
});

describe("formatDate", () => {
  it("should format Date object in French locale", () => {
    const date = new Date("2024-01-15");
    const result = formatDate(date);
    expect(result).toContain("janvier");
    expect(result).toContain("2024");
  });

  it("should format date string", () => {
    const result = formatDate("2024-06-20");
    expect(result).toContain("juin");
    expect(result).toContain("2024");
  });

  it("should return dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });
});

describe("formatCurrency", () => {
  it("should format number as EUR currency", () => {
    const result = formatCurrency(1500);
    expect(result).toContain("1");
    expect(result).toContain("500");
    expect(result).toContain("€");
  });

  it("should format large numbers with thousand separators", () => {
    const result = formatCurrency(1000000);
    // French format uses non-breaking space as thousand separator
    expect(result.replace(/\s/g, "")).toContain("1000000");
  });

  it("should return dash for null", () => {
    expect(formatCurrency(null)).toBe("—");
  });

  it("should handle zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0");
    expect(result).toContain("€");
  });
});

describe("generateAffairSlug", () => {
  it("prefixes the politician slug when the title does not carry the name", () => {
    expect(
      generateAffairSlug("serge-letchimy", "Concussion dans les conditions de sa réintégration")
    ).toBe("serge-letchimy-concussion-dans-les-conditions-de-sa-reintegration");
  });

  // The discovery pipeline writes titles of the form "Condamnation de X pour Y",
  // so prefixing the politician slug repeated the name inside the URL.
  it("does not repeat the name when the title already carries it", () => {
    expect(
      generateAffairSlug(
        "gerard-spinelli",
        "Condamnation de Gérard Spinelli pour détournement de fonds publics"
      )
    ).toBe("condamnation-de-gerard-spinelli-pour-detournement-de-fonds-publics");
  });

  it("strips accents, punctuation and casing", () => {
    expect(generateAffairSlug("jean-dupont", "Affaire des « emplois fictifs »")).toBe(
      "jean-dupont-emplois-fictifs"
    );
  });

  it("is stable when the politician slug is empty", () => {
    expect(generateAffairSlug("", "Emplois fictifs")).toBe("emplois-fictifs");
  });

  // A judicial URL travels away from the page that carries it, so the suffix
  // telling two homonyms apart is kept even at the cost of writing the name
  // twice. Appending it at the end instead would be indistinguishable from the
  // collision counter generateUniqueSlug adds.
  it("keeps the disambiguating prefix for a homonym, even if the title repeats the name", () => {
    expect(
      generateAffairSlug(
        "alain-garnier-3",
        "Condamnation de Alain Garnier pour favoritisme",
        "alain-garnier"
      )
    ).toBe("alain-garnier-3-condamnation-de-alain-garnier-pour-favoritisme");
  });

  it("still prefixes a disambiguated slug when the title omits the name", () => {
    expect(
      generateAffairSlug("alain-garnier-3", "Marché public du festival", "alain-garnier")
    ).toBe("alain-garnier-3-marche-public-du-festival");
  });

  it("falls back to the URL slug when no canonical name is given", () => {
    expect(generateAffairSlug("alain-garnier-3", "Condamnation de Alain Garnier")).toBe(
      "alain-garnier-3-condamnation-de-alain-garnier"
    );
  });

  it("accepts a raw full name as the canonical argument", () => {
    expect(
      generateAffairSlug("alain-garnier-3", "Condamnation de Alain Garnier", "Alain Garnier")
    ).toBe("alain-garnier-3-condamnation-de-alain-garnier");
  });

  // The prefix is dropped only when it carries nothing the title does not.
  it("drops the prefix only when the slug is the bare name", () => {
    expect(
      generateAffairSlug("gerard-spinelli", "Condamnation de Gérard Spinelli", "Gérard Spinelli")
    ).toBe("condamnation-de-gerard-spinelli");
  });
});

describe("generateUniqueSlug", () => {
  const free = async () => false;

  it("truncates to maxLength even when the first candidate is free", async () => {
    const base = "a".repeat(200);
    const slug = await generateUniqueSlug(base, free, 120);
    expect(slug).toHaveLength(120);
  });

  it("does not leave a dangling separator after truncating", async () => {
    const slug = await generateUniqueSlug(`${"ab-".repeat(60)}fin`, free, 20);
    expect(slug).not.toMatch(/-$/);
    expect(slug.length).toBeLessThanOrEqual(20);
  });

  it("leaves a short base untouched", async () => {
    expect(await generateUniqueSlug("emplois-fictifs", free, 120)).toBe("emplois-fictifs");
  });

  it("appends a counter on collision, within maxLength", async () => {
    const taken = new Set([`${"a".repeat(120)}`]);
    const slug = await generateUniqueSlug("a".repeat(200), async (c) => taken.has(c), 120);
    expect(slug).toBe(`${"a".repeat(118)}-2`);
    expect(slug).toHaveLength(120);
  });
});
