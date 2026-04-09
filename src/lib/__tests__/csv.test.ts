import { describe, expect, it } from "vitest";
import { stripMarkdownForCSV } from "../csv";

describe("stripMarkdownForCSV", () => {
  it("returns empty string for empty or nullish input", () => {
    expect(stripMarkdownForCSV("")).toBe("");
    expect(stripMarkdownForCSV(null)).toBe("");
    expect(stripMarkdownForCSV(undefined)).toBe("");
  });

  it("strips inline links but keeps the anchor text", () => {
    const input = "[Éric Zemmour](/politiques/eric-zemmour) porte plainte";
    expect(stripMarkdownForCSV(input)).toBe("Éric Zemmour porte plainte");
  });

  it("strips multiple links in the same paragraph", () => {
    const input =
      "[Éric Zemmour](/politiques/eric-zemmour), dirigeant de [Reconquête](/partis/reconquete), est renvoyé.";
    expect(stripMarkdownForCSV(input)).toBe("Éric Zemmour, dirigeant de Reconquête, est renvoyé.");
  });

  it("strips bold and italic emphasis", () => {
    expect(stripMarkdownForCSV("**Les faits** sont clairs")).toBe("Les faits sont clairs");
    expect(stripMarkdownForCSV("*en cours*")).toBe("en cours");
    expect(stripMarkdownForCSV("_important_")).toBe("important");
    expect(stripMarkdownForCSV("__très__ important")).toBe("très important");
  });

  it("collapses multiple whitespace runs into single spaces", () => {
    expect(stripMarkdownForCSV("a  b   c")).toBe("a b c");
    expect(stripMarkdownForCSV("ligne1\n\nligne2")).toBe("ligne1 ligne2");
    expect(stripMarkdownForCSV("ligne1\r\n\r\nligne2")).toBe("ligne1 ligne2");
  });

  it("does not truncate long descriptions", () => {
    // The bug in the old export was substring(0, 500) mid-sentence.
    // The new helper must preserve full length.
    const longText = "a".repeat(2000);
    expect(stripMarkdownForCSV(longText).length).toBe(2000);
  });

  it("handles the real Zemmour affair description without corruption", () => {
    const input = `[Éric Zemmour](/politiques/eric-zemmour), dirigeant de [Reconquête](/partis/reconquete), est renvoyé en mai 2024 devant la XVIIe chambre correctionnelle du tribunal judiciaire de Paris pour des propos tenus entre 2021 et mars 2022 sur le plateau de CNews.

**Les faits**

Les déclarations incriminées portent sur les trafiquants de crack et établissent un lien direct avec une origine géographique. En 2021, [Zemmour](/politiques/eric-zemmour) aurait affirmé que « tous les trafiquants de cracks sont sénégalais ».`;

    const output = stripMarkdownForCSV(input);

    // No markdown link syntax survives
    expect(output).not.toContain("](");
    expect(output).not.toContain("[");

    // No bold/italic markers survive
    expect(output).not.toContain("**");

    // Content is intact
    expect(output).toContain("Éric Zemmour");
    expect(output).toContain("Reconquête");
    expect(output).toContain("Les faits");
    expect(output).toContain("tous les trafiquants de cracks sont sénégalais");

    // French accents preserved
    expect(output).toContain("é");
    expect(output).toContain("ê"); // from "Reconquête"

    // No paragraph breaks remain (collapsed to single spaces)
    expect(output).not.toContain("\n\n");

    // No mid-sentence truncation like "dépassent pas les li"
    expect(output.trim().endsWith("sénégalais ».")).toBe(true);
  });

  it("escapes or preserves commas and quotes so CSV wrapper can handle them", () => {
    // The CSV wrapper (escapeCSV) handles commas and quotes — this helper
    // should NOT alter them, just strip markdown.
    const input = "Il a dit : \"c'est **faux**\", comme d'habitude.";
    const output = stripMarkdownForCSV(input);
    expect(output).toContain('"c\'est faux"');
    expect(output).not.toContain("**");
  });

  it("leaves plain text with no markdown unchanged", () => {
    const input = "Affaire classée sans suite le 15 mars 2024.";
    expect(stripMarkdownForCSV(input)).toBe(input);
  });
});
