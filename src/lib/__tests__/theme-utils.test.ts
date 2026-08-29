import { describe, expect, it } from "vitest";
import {
  getAllLegacyThemeSlugs,
  legacyThemeFromSlug,
  LEGACY_THEME_CATEGORIES,
} from "@/lib/theme-utils";

describe("taxonomie thématique historique", () => {
  it("borne les routes parlementaires aux 13 thèmes historiques", () => {
    expect(getAllLegacyThemeSlugs()).toHaveLength(13);
    expect(getAllLegacyThemeSlugs()).toEqual(
      LEGACY_THEME_CATEGORIES.map((theme) => theme.toLowerCase().replace(/_/g, "-"))
    );
    expect(legacyThemeFromSlug("social-travail")).toBe("SOCIAL_TRAVAIL");
    expect(legacyThemeFromSlug("retraites")).toBeNull();
    expect(legacyThemeFromSlug("emploi-travail")).toBeNull();
  });
});
