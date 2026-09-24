import { describe, it, expect } from "vitest";
import {
  decodeHtmlEntities,
  stripHtml,
  normalizeWhitespace,
  extractText,
  extractAttribute,
  containsHtml,
} from "./html-utils";

describe("decodeHtmlEntities", () => {
  it("should decode common named entities", () => {
    expect(decodeHtmlEntities("&amp;")).toBe("&");
    expect(decodeHtmlEntities("&lt;")).toBe("<");
    expect(decodeHtmlEntities("&gt;")).toBe(">");
    expect(decodeHtmlEntities("&quot;")).toBe('"');
    expect(decodeHtmlEntities("&apos;")).toBe("'");
    expect(decodeHtmlEntities("&nbsp;")).toBe(" ");
  });

  it("should decode French accented characters", () => {
    expect(decodeHtmlEntities("Fran&ccedil;ois")).toBe("François");
    expect(decodeHtmlEntities("&eacute;lu")).toBe("élu");
    expect(decodeHtmlEntities("&egrave;re")).toBe("ère");
    expect(decodeHtmlEntities("&agrave; Paris")).toBe("à Paris");
    expect(decodeHtmlEntities("d&ecirc;p&ecirc;che")).toBe("dêpêche");
    expect(decodeHtmlEntities("&ocirc;ter")).toBe("ôter");
    expect(decodeHtmlEntities("s&ucirc;r")).toBe("sûr");
  });

  it("should decode uppercase French accented characters", () => {
    expect(decodeHtmlEntities("&Eacute;cole")).toBe("École");
    expect(decodeHtmlEntities("&Agrave; Paris")).toBe("À Paris");
  });

  it("should decode special characters", () => {
    expect(decodeHtmlEntities("100&deg;C")).toBe("100°C");
    expect(decodeHtmlEntities("50&euro;")).toBe("50€");
    expect(decodeHtmlEntities("&copy; 2024")).toBe("© 2024");
  });

  it("should decode punctuation entities", () => {
    expect(decodeHtmlEntities("l&rsquo;affaire")).toBe("l'affaire");
    expect(decodeHtmlEntities("&laquo;test&raquo;")).toBe("&laquo;test&raquo;"); // Not in our map
    expect(decodeHtmlEntities("Jean&ndash;Pierre")).toBe("Jean–Pierre");
    expect(decodeHtmlEntities("et&hellip;")).toBe("et…");
  });

  it("should decode decimal numeric entities", () => {
    expect(decodeHtmlEntities("&#233;lu")).toBe("élu"); // é = 233
    expect(decodeHtmlEntities("&#160;")).toBe("\u00A0"); // Non-breaking space (char 160)
    expect(decodeHtmlEntities("&#39;")).toBe("'"); // Apostrophe
  });

  it("should decode hexadecimal numeric entities", () => {
    expect(decodeHtmlEntities("&#x00E9;lu")).toBe("élu"); // é = 0xE9
    expect(decodeHtmlEntities("&#xE9;lu")).toBe("élu"); // Shorter form
    expect(decodeHtmlEntities("&#x27;")).toBe("'"); // Apostrophe
  });

  it("should handle mixed entities", () => {
    expect(decodeHtmlEntities("Fran&ccedil;ois &#233;tait l&agrave;")).toBe("François était là");
  });

  it("should handle empty and null-like inputs", () => {
    expect(decodeHtmlEntities("")).toBe("");
    expect(decodeHtmlEntities(null as unknown as string)).toBe("");
    expect(decodeHtmlEntities(undefined as unknown as string)).toBe("");
  });

  it("should preserve non-entity text", () => {
    expect(decodeHtmlEntities("Hello World")).toBe("Hello World");
    expect(decodeHtmlEntities("Test 123")).toBe("Test 123");
  });
});

describe("stripHtml", () => {
  it("should remove simple HTML tags", () => {
    expect(stripHtml("<p>Hello World</p>")).toBe("Hello World");
    expect(stripHtml("<b>Bold</b>")).toBe("Bold");
    expect(stripHtml("<a href='url'>Link</a>")).toBe("Link");
  });

  it("should remove nested tags", () => {
    expect(stripHtml("<div><p>Hello <b>World</b></p></div>")).toBe("Hello World");
  });

  it("should remove self-closing tags", () => {
    expect(stripHtml("Hello<br/>World")).toBe("HelloWorld");
    expect(stripHtml("Hello<br />World")).toBe("HelloWorld");
  });

  it("should remove script and style tags with content", () => {
    expect(stripHtml("<script>alert('xss')</script>Hello")).toBe("Hello");
    expect(stripHtml("<style>.red{color:red}</style>Hello")).toBe("Hello");
  });

  it("should handle empty and null-like inputs", () => {
    expect(stripHtml("")).toBe("");
    expect(stripHtml(null as unknown as string)).toBe("");
    expect(stripHtml(undefined as unknown as string)).toBe("");
  });

  it("should preserve plain text", () => {
    expect(stripHtml("Hello World")).toBe("Hello World");
  });
});

describe("normalizeWhitespace", () => {
  it("should collapse multiple spaces", () => {
    expect(normalizeWhitespace("Hello   World")).toBe("Hello World");
    expect(normalizeWhitespace("A  B  C")).toBe("A B C");
  });

  it("should replace newlines with spaces", () => {
    expect(normalizeWhitespace("Hello\nWorld")).toBe("Hello World");
    expect(normalizeWhitespace("Hello\r\nWorld")).toBe("Hello World");
  });

  it("should replace tabs with spaces", () => {
    expect(normalizeWhitespace("Hello\tWorld")).toBe("Hello World");
  });

  it("should handle mixed whitespace", () => {
    expect(normalizeWhitespace("Hello  \n\t  World")).toBe("Hello World");
  });

  it("should trim leading and trailing whitespace", () => {
    expect(normalizeWhitespace("  Hello World  ")).toBe("Hello World");
    expect(normalizeWhitespace("\n\nHello\n\n")).toBe("Hello");
  });

  it("should handle empty and null-like inputs", () => {
    expect(normalizeWhitespace("")).toBe("");
    expect(normalizeWhitespace(null as unknown as string)).toBe("");
    expect(normalizeWhitespace(undefined as unknown as string)).toBe("");
  });
});

describe("extractText", () => {
  it("should extract clean text from HTML", () => {
    expect(extractText("<p>Hello World</p>")).toBe("Hello World");
  });

  it("should decode entities and clean whitespace", () => {
    expect(extractText("<p>Fran&ccedil;ois   Hollande</p>")).toBe("François Hollande");
  });

  it("should handle complex HTML", () => {
    const html = `
      <div>
        <h1>&Eacute;lection pr&eacute;sidentielle</h1>
        <p>Le candidat   est   &eacute;lu.</p>
      </div>
    `;
    expect(extractText(html)).toBe("Élection présidentielle Le candidat est élu.");
  });

  it("should handle empty input", () => {
    expect(extractText("")).toBe("");
    expect(extractText(null as unknown as string)).toBe("");
  });
});

describe("extractAttribute", () => {
  it("should extract href attribute", () => {
    expect(extractAttribute('<a href="https://example.com">Link</a>', "href")).toBe(
      "https://example.com"
    );
  });

  it("should extract src attribute", () => {
    expect(extractAttribute('<img src="photo.jpg" alt="Photo">', "src")).toBe("photo.jpg");
  });

  it("should handle single quotes", () => {
    expect(extractAttribute("<a href='https://example.com'>Link</a>", "href")).toBe(
      "https://example.com"
    );
  });

  it("should be case-insensitive", () => {
    expect(extractAttribute('<a HREF="https://example.com">Link</a>', "href")).toBe(
      "https://example.com"
    );
  });

  it("should return null for missing attribute", () => {
    expect(extractAttribute("<a>Link</a>", "href")).toBeNull();
  });

  it("should return null for empty inputs", () => {
    expect(extractAttribute("", "href")).toBeNull();
    expect(extractAttribute("<a href='url'>", "")).toBeNull();
    expect(extractAttribute(null as unknown as string, "href")).toBeNull();
  });
});

describe("containsHtml", () => {
  it("should return true for strings with HTML tags", () => {
    expect(containsHtml("<p>Hello</p>")).toBe(true);
    expect(containsHtml("<div>Test</div>")).toBe(true);
    expect(containsHtml("Hello <b>World</b>")).toBe(true);
    expect(containsHtml("<br/>")).toBe(true);
  });

  it("should return false for plain text", () => {
    expect(containsHtml("Hello World")).toBe(false);
    expect(containsHtml("Test 123")).toBe(false);
  });

  it("should return false for HTML entities without tags", () => {
    expect(containsHtml("&eacute;")).toBe(false);
    expect(containsHtml("5 &gt; 3")).toBe(false);
  });

  it("should handle empty and null-like inputs", () => {
    expect(containsHtml("")).toBe(false);
    expect(containsHtml(null as unknown as string)).toBe(false);
    expect(containsHtml(undefined as unknown as string)).toBe(false);
  });
});

/**
 * `stripHtml` produit du texte, jamais du balisage. Tant qu'un chevron survit, la sortie peut
 * reformer une balise en se concaténant à autre chose, et le lecteur suivant croit tenir du texte.
 */
describe("stripHtml ne laisse pas de balisage résiduel", () => {
  it("retire une balise fermante écrite avec une espace", () => {
    expect(stripHtml("a<script>alert(1)</script >b")).toBe("ab");
  });

  it("ne laisse aucun chevron, même sur une balise jamais refermée", () => {
    expect(stripHtml("texte <script")).toBe("texte script");
    expect(stripHtml("a <b")).toBe("a b");
  });

  it("neutralise une balise imbriquée dans son propre nom", () => {
    expect(stripHtml("<scr<script>ipt>alert(1)</script>")).not.toContain("<");
  });
});
