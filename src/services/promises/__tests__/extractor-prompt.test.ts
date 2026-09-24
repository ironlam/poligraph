import { describe, expect, it } from "vitest";
import { sanitizeForPrompt } from "../extractor";

/**
 * Le texte vient d'un article de presse et se retrouve entre `<article>` et `</article>` dans le
 * prompt. Ce qui compte ici n'est pas le HTML mais le délimiteur : un texte capable de refermer
 * `<article>` peut faire passer la suite pour une consigne.
 */
describe("sanitizeForPrompt", () => {
  it("retire une balise simple", () => {
    expect(sanitizeForPrompt("a<article>b</article>c")).toBe("abc");
  });

  /** L'ancienne expression n'acceptait ni espace ni attribut, donc les laissait passer. */
  it("retire aussi ce qui porte une espace ou un attribut", () => {
    expect(sanitizeForPrompt("a</article >b")).not.toMatch(/[<>]/);
    expect(sanitizeForPrompt('a<article id="x">b')).not.toMatch(/[<>]/);
  });

  it("garde un texte ordinaire intact", () => {
    expect(sanitizeForPrompt("Le budget passe de 3 a 5 milliards.")).toBe(
      "Le budget passe de 3 a 5 milliards."
    );
  });
});
