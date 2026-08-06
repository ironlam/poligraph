import { describe, it, expect } from "vitest";
import { themeToSlug, parseThemeSlug, THEMES_IN_ORDER, PRESIDENTIELLE_2027_SLUG } from "../themes";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import type { ThemeCategory } from "@/generated/prisma";

describe("theme route helpers", () => {
  it("round-trips every ThemeCategory", () => {
    for (const theme of Object.keys(THEME_CATEGORY_LABELS) as ThemeCategory[]) {
      expect(parseThemeSlug(themeToSlug(theme))).toBe(theme);
    }
  });
  it("maps LOGEMENT_URBANISME to logement-urbanisme", () => {
    expect(themeToSlug("LOGEMENT_URBANISME")).toBe("logement-urbanisme");
  });
  it("returns null for unknown slug", () => {
    expect(parseThemeSlug("not-a-theme")).toBeNull();
    expect(parseThemeSlug("")).toBeNull();
  });
  it("lists all 13 themes once", () => {
    expect(THEMES_IN_ORDER).toHaveLength(13);
    expect(new Set(THEMES_IN_ORDER)).toEqual(new Set(Object.keys(THEME_CATEGORY_LABELS)));
  });
  it("pins the slug", () => {
    expect(PRESIDENTIELLE_2027_SLUG).toBe("presidentielle-2027");
  });
});
