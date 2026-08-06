import type { ThemeCategory } from "@/generated/prisma";

export { themeToSlug, themeFromSlug as parseThemeSlug } from "@/lib/theme-utils";

export const PRESIDENTIELLE_2027_SLUG = "presidentielle-2027";

/** Editorial display order of the 13 themes (topical, announced as such, not a ranking). */
export const THEMES_IN_ORDER: ThemeCategory[] = [
  "LOGEMENT_URBANISME",
  "SANTE",
  "SOCIAL_TRAVAIL",
  "ECONOMIE_BUDGET",
  "ENVIRONNEMENT_ENERGIE",
  "SECURITE_JUSTICE",
  "EDUCATION_CULTURE",
  "IMMIGRATION",
  "TRANSPORTS",
  "AGRICULTURE_ALIMENTATION",
  "NUMERIQUE_TECH",
  "AFFAIRES_ETRANGERES_DEFENSE",
  "INSTITUTIONS",
];
