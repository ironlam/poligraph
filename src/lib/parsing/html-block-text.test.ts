import { describe, it, expect } from "vitest";
import { extractBlockText } from "./html-block-text";

describe("extractBlockText", () => {
  it("should turn block boundaries into line breaks", () => {
    expect(extractBlockText("<p>Mesdames,</p><p>Messieurs,</p>")).toBe("Mesdames,\nMessieurs,");
    expect(extractBlockText("Ligne 1<br>Ligne 2")).toBe("Ligne 1\nLigne 2");
  });

  it("should keep inline markup on the same line", () => {
    expect(extractBlockText("<p>Le <b>projet</b> de loi</p>")).toBe("Le projet de loi");
  });

  it("should decode entities", () => {
    expect(extractBlockText("<p>d&eacute;put&eacute;s &amp; s&eacute;nateurs</p>")).toBe(
      "députés & sénateurs"
    );
  });

  it("should collapse blank runs left by the source indentation", () => {
    expect(extractBlockText("<div>\n  <p>A</p>\n\n\n  <p>B</p>\n</div>")).toBe("A\n\nB");
  });

  it("should drop scripts, styles and comments", () => {
    const html = "<head><style>p{color:red}</style></head><body><!-- note --><p>Texte</p></body>";
    expect(extractBlockText(html)).toBe("Texte");
  });

  it("should not leave a tag that a single strip pass would splice back together", () => {
    // A regex pass removing "<script>" turns "<scr<script>ipt>" back into a
    // live tag; a parser has no such reassembly (CodeQL "incomplete
    // multi-character sanitization").
    expect(extractBlockText("<p>avant<scr<script>ipt>alert(1)</script>après</p>")).not.toContain(
      "<script"
    );
    expect(extractBlockText("<p>a<!<!-- x -->-- y -->b</p>")).not.toContain("<!--");
  });

  it("should handle empty inputs", () => {
    expect(extractBlockText("")).toBe("");
    expect(extractBlockText(null as unknown as string)).toBe("");
  });
});
