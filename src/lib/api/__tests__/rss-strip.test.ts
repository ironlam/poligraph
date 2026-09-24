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

  it("ne laisse aucun chevron résiduel", () => {
    expect(stripHtmlTags("Titre <script")).not.toMatch(/[<>]/);
    expect(stripHtmlTags("a <img src=x onerror=1")).not.toMatch(/[<>]/);
  });

  it("garde le texte intact quand il n'y a rien à retirer", () => {
    expect(stripHtmlTags("  Un titre ordinaire  ")).toBe("Un titre ordinaire");
  });
});
