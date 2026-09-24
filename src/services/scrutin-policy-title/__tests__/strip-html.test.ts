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

describe("balisage résiduel", () => {
  it("ne laisse aucun chevron", () => {
    expect(stripHtml("<p>a<script</p>")).not.toMatch(/[<>]/);
  });

  /**
   * L'ordre compte : le retrait des chevrons doit précéder le décodage, sinon un `&lt;` légitime
   * du texte AN, par exemple « seuil &lt; 5 % », disparaîtrait avec les balises.
   */
  it("préserve un chevron qui vient d'une entité", () => {
    expect(stripHtml("<p>seuil &lt; 5 %</p>")).toBe("seuil < 5 %");
  });
});
