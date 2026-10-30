import type { ThemeCategory } from "@/generated/prisma";

/**
 * How a presidential subject lands on the parliamentary taxonomy.
 *
 * Measures use a finer taxonomy than the dossiers and scrutins, which still carry the historical
 * one (see `LEGACY_THEME_CATEGORIES`). Three presidential subjects fold into the broader
 * SOCIAL_TRAVAIL, and SOCIETE_DROITS_LIBERTES has no parliamentary counterpart: it maps to nothing
 * rather than to a guess. This is a thematic proximity, never a link between a measure and a text.
 */
export type ParliamentThemeScope = "same" | "broader";

export interface ParliamentThemeTarget {
  theme: ThemeCategory;
  scope: ParliamentThemeScope;
}

const BROADER: Partial<Record<ThemeCategory, ThemeCategory>> = {
  EMPLOI_TRAVAIL: "SOCIAL_TRAVAIL",
  RETRAITES: "SOCIAL_TRAVAIL",
  SOLIDARITES_PROTECTION_SOCIALE: "SOCIAL_TRAVAIL",
};

const NO_COUNTERPART: ReadonlySet<ThemeCategory> = new Set(["SOCIETE_DROITS_LIBERTES"]);

export function getParliamentThemeTarget(theme: ThemeCategory): ParliamentThemeTarget | null {
  if (NO_COUNTERPART.has(theme)) return null;
  const broader = BROADER[theme];
  return broader ? { theme: broader, scope: "broader" } : { theme, scope: "same" };
}
