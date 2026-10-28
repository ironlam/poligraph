import { describe, expect, it } from "vitest";
import { THEMES_IN_ORDER } from "../themes";
import { getParliamentThemeTarget } from "../parliament-bridge";
import { LEGACY_THEME_CATEGORIES } from "@/lib/theme-utils";

describe("getParliamentThemeTarget", () => {
  it("garde le même thème quand le Parlement le connaît", () => {
    expect(getParliamentThemeTarget("SANTE")).toEqual({ theme: "SANTE", scope: "same" });
  });

  it("replie les thèmes présidentiels fins sur la catégorie sociale, signalée comme plus large", () => {
    for (const theme of [
      "EMPLOI_TRAVAIL",
      "RETRAITES",
      "SOLIDARITES_PROTECTION_SOCIALE",
    ] as const) {
      expect(getParliamentThemeTarget(theme)).toEqual({
        theme: "SOCIAL_TRAVAIL",
        scope: "broader",
      });
    }
  });

  it("ne devine rien pour un thème sans équivalent parlementaire", () => {
    expect(getParliamentThemeTarget("SOCIETE_DROITS_LIBERTES")).toBeNull();
  });

  it("n'oriente jamais vers un thème que les dossiers n'utilisent pas", () => {
    const legacy = new Set<string>(LEGACY_THEME_CATEGORIES);
    for (const theme of THEMES_IN_ORDER) {
      const target = getParliamentThemeTarget(theme);
      if (target !== null) expect(legacy.has(target.theme)).toBe(true);
    }
  });
});
