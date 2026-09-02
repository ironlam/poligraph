import { ThemeCategory } from "@/generated/prisma";

const THEME_SLUGS: Record<string, ThemeCategory> = {
  "economie-budget": "ECONOMIE_BUDGET",
  "social-travail": "SOCIAL_TRAVAIL",
  "emploi-travail": "EMPLOI_TRAVAIL",
  retraites: "RETRAITES",
  "solidarites-protection-sociale": "SOLIDARITES_PROTECTION_SOCIALE",
  "societe-droits-libertes": "SOCIETE_DROITS_LIBERTES",
  "securite-justice": "SECURITE_JUSTICE",
  "environnement-energie": "ENVIRONNEMENT_ENERGIE",
  sante: "SANTE",
  "education-culture": "EDUCATION_CULTURE",
  institutions: "INSTITUTIONS",
  "affaires-etrangeres-defense": "AFFAIRES_ETRANGERES_DEFENSE",
  "numerique-tech": "NUMERIQUE_TECH",
  immigration: "IMMIGRATION",
  "agriculture-alimentation": "AGRICULTURE_ALIMENTATION",
  "logement-urbanisme": "LOGEMENT_URBANISME",
  transports: "TRANSPORTS",
};

/** Historical broad taxonomy used by legislative dossiers, scrutins and promises. */
export const LEGACY_THEME_CATEGORIES = [
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
] as const satisfies readonly ThemeCategory[];

const LEGACY_THEME_SET = new Set<ThemeCategory>(LEGACY_THEME_CATEGORIES);

export function themeFromSlug(slug: string): ThemeCategory | null {
  return THEME_SLUGS[slug] || null;
}

export function legacyThemeFromSlug(slug: string): ThemeCategory | null {
  const theme = themeFromSlug(slug);
  return theme !== null && LEGACY_THEME_SET.has(theme) ? theme : null;
}

export function themeToSlug(theme: ThemeCategory): string {
  return theme.toLowerCase().replace(/_/g, "-");
}

export function getAllThemeSlugs(): string[] {
  return Object.keys(THEME_SLUGS);
}

export function getAllLegacyThemeSlugs(): string[] {
  return LEGACY_THEME_CATEGORIES.map(themeToSlug);
}
