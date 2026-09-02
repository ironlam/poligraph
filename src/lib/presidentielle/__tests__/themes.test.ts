import { describe, it, expect } from "vitest";
import {
  findMatchingThemes,
  findThemesMentionedInQuery,
  getPresidentialThemeIndexOrder,
  themeToSlug,
  parseThemeSlug,
  THEMES_IN_ORDER,
  PRESIDENTIELLE_2027_SLUG,
} from "../themes";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import type { ThemeCategory } from "@/generated/prisma";

describe("theme route helpers", () => {
  it("round-trips every presidential theme", () => {
    for (const theme of THEMES_IN_ORDER) {
      expect(parseThemeSlug(themeToSlug(theme))).toBe(theme);
    }
    expect(parseThemeSlug(themeToSlug("SOCIAL_TRAVAIL"))).toBe("SOCIAL_TRAVAIL");
  });
  it("maps LOGEMENT_URBANISME to logement-urbanisme", () => {
    expect(themeToSlug("LOGEMENT_URBANISME")).toBe("logement-urbanisme");
  });
  it("returns null for unknown slug", () => {
    expect(parseThemeSlug("not-a-theme")).toBeNull();
    expect(parseThemeSlug("")).toBeNull();
  });
  it("lists all 16 presidential themes once", () => {
    expect(THEMES_IN_ORDER).toHaveLength(16);
    const allThemes = Object.keys(THEME_CATEGORY_LABELS) as ThemeCategory[];
    expect(new Set(THEMES_IN_ORDER)).toEqual(
      new Set(allThemes.filter((theme) => theme !== "SOCIAL_TRAVAIL"))
    );
  });
  it("pins the slug", () => {
    expect(PRESIDENTIELLE_2027_SLUG).toBe("presidentielle-2027");
  });
  it("n'expose le thème historique que tant que des mesures le portent", () => {
    expect(getPresidentialThemeIndexOrder(new Set(["SANTE"]))).toEqual(THEMES_IN_ORDER);
    expect(getPresidentialThemeIndexOrder(new Set(["SOCIAL_TRAVAIL"]))).toEqual([
      ...THEMES_IN_ORDER,
      "SOCIAL_TRAVAIL",
    ]);
  });
  it("retrouve un thème par un mot de son libellé, accents neutralisés", () => {
    expect(findMatchingThemes("Logement")).toEqual(["LOGEMENT_URBANISME"]);
    expect(findMatchingThemes("santé")).toEqual(["SANTE"]);
  });
  it("complète les mots d'un thème à partir de trois caractères", () => {
    expect(findMatchingThemes("loge")).toEqual(["LOGEMENT_URBANISME"]);
    expect(findMatchingThemes("urban")).toEqual(["LOGEMENT_URBANISME"]);
    expect(findMatchingThemes("sant")).toEqual(["SANTE"]);
    expect(findMatchingThemes("lo")).toEqual([]);
  });
  it("ne transforme pas un mot étranger à la taxonomie en thème", () => {
    expect(findMatchingThemes("introuvable")).toEqual([]);
  });
  it("retrouve un thème cité dans une question complète", () => {
    expect(
      findThemesMentionedInQuery("Que proposent les candidats pour réduire le coût du logement ?")
    ).toEqual(["LOGEMENT_URBANISME"]);
  });
});
