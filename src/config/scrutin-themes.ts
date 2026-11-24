/**
 * The themes scrutins carry: thirteen of the seventeen ThemeCategory values. The four others
 * (EMPLOI_TRAVAIL, RETRAITES, SOLIDARITES_PROTECTION_SOCIALE, SOCIETE_DROITS_LIBERTES) tag
 * presidential measures only. A fact-check theme stays in this list so that it always meets votes.
 * No directive and no import: the theme classifier, the admin schemas and client components read it,
 * and src/lib/theme-utils.ts exposes it as LEGACY_THEME_CATEGORIES.
 */
export const SCRUTIN_THEMES = [
  "ECONOMIE_BUDGET",
  "SOCIAL_TRAVAIL",
  "SECURITE_JUSTICE",
  "ENVIRONNEMENT_ENERGIE",
  "SANTE",
  "EDUCATION_CULTURE",
  "INSTITUTIONS",
  "AFFAIRES_ETRANGERES_DEFENSE",
  "NUMERIQUE_TECH",
  "IMMIGRATION",
  "AGRICULTURE_ALIMENTATION",
  "LOGEMENT_URBANISME",
  "TRANSPORTS",
] as const;

export type ScrutinTheme = (typeof SCRUTIN_THEMES)[number];
