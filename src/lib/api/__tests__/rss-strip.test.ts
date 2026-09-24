import { describe, expect, it } from "vitest";
import { stripHtmlTags } from "../rss";

/**
 * Le titre et la description d'un article de presse passent par là avant d'être stockés, rendus
 * et donnés à un modèle. Ce sont des flux tiers : on n'a pas la main sur ce qu'ils contiennent.
 */
describe("stripHtmlTags", () => {
  it("retire les balises", () => {
    expect(stripHtmlTags("<p>Titre <b>en gras</b></p>")).toBe("Titre en gras");
  });

  it("retire une balise portant une espace ou un attribut", () => {
    expect(stripHtmlTags('a<span class="x">b</span >c')).toBe("abc");
  });

  /** Un titre de presse chiffré ne doit pas perdre son seuil au passage. */
  it("garde les opérateurs de comparaison", () => {
    expect(stripHtmlTags("Déficit < 3 % : Bruxelles insiste")).toBe(
      "Déficit < 3 % : Bruxelles insiste"
    );
  });

  it("garde le texte intact quand il n'y a rien à retirer", () => {
    expect(stripHtmlTags("  Un titre ordinaire  ")).toBe("Un titre ordinaire");
  });
});
