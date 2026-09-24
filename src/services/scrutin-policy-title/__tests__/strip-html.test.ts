import { describe, it, expect } from "vitest";
import { stripHtml } from "@/services/scrutin-policy-title/strip-html";

describe("stripHtml", () => {
  it("removes tags and decodes hex entities", () => {
    expect(stripHtml("<p>Supprimer l&#x2019;alin&#xE9;a 3.</p>")).toBe("Supprimer l’alinéa 3.");
  });
  it("decodes decimal entities and named entities", () => {
    expect(stripHtml("Eau &amp; for&#234;t &nbsp;publique")).toBe("Eau & forêt publique");
  });
  it("turns block boundaries into spaces, not concatenation", () => {
    expect(stripHtml("<p>Alpha</p><p>Beta</p>")).toBe("Alpha Beta");
  });
  it("collapses whitespace and trims", () => {
    expect(stripHtml("  <div>a\n\n   b </div> ")).toBe("a b");
  });
  it("returns empty string for empty/whitespace input", () => {
    expect(stripHtml("")).toBe("");
    expect(stripHtml("   ")).toBe("");
  });
});

describe("comparaisons dans le texte AN", () => {
  /** Un amendement qui fixe un seuil est précisément ce qu'on ne doit pas tronquer. */
  it("préserve un chevron qui vient d'une entité", () => {
    expect(stripHtml("<p>seuil &lt; 5 %</p>")).toBe("seuil < 5 %");
  });

  it("préserve un chevron écrit littéralement", () => {
    expect(stripHtml("<p>déficit < 3 % et dette > 100 %</p>")).toBe(
      "déficit < 3 % et dette > 100 %"
    );
  });
});
