import type { ThemeCategory } from "@/generated/prisma";

/**
 * SEO grammar for the thematic vote landings (/parlement/votes/themes/[theme]).
 *
 * The display labels (THEME_CATEGORY_LABELS) are noun phrases meant for badges
 * and cards ("Santé", "Économie & Budget"). Injected into a sentence they give
 * incorrect French ("Votes sur économie"), so the prepositional form lives here
 * instead of being patched case by case inside the page.
 *
 * Every phrase is written to read after "sur" ("Votes sur la santé"), which is
 * also the form used by the visible intro and by the contextual links pointing
 * at these landings.
 */
export const THEME_SEO_PHRASES: Record<ThemeCategory, string> = {
  ECONOMIE_BUDGET: "l'économie et le budget",
  SOCIAL_TRAVAIL: "les questions sociales et le travail",
  EMPLOI_TRAVAIL: "l'emploi et le travail",
  RETRAITES: "les retraites",
  SOLIDARITES_PROTECTION_SOCIALE: "les solidarités et la protection sociale",
  SOCIETE_DROITS_LIBERTES: "les droits et libertés dans la société",
  SECURITE_JUSTICE: "la sécurité et la justice",
  ENVIRONNEMENT_ENERGIE: "l'environnement et l'énergie",
  SANTE: "la santé",
  EDUCATION_CULTURE: "l'éducation et la culture",
  INSTITUTIONS: "les institutions",
  AFFAIRES_ETRANGERES_DEFENSE: "les affaires étrangères et la défense",
  NUMERIQUE_TECH: "le numérique et les technologies",
  IMMIGRATION: "l'immigration",
  AGRICULTURE_ALIMENTATION: "l'agriculture et l'alimentation",
  LOGEMENT_URBANISME: "le logement et l'urbanisme",
  TRANSPORTS: "les transports",
};

/** Prepositional form of a theme, to be used after "sur". */
export function themeSeoPhrase(theme: ThemeCategory): string {
  return THEME_SEO_PHRASES[theme];
}

/**
 * Chambers actually represented among the scrutins referenced under a theme.
 * Derived from the data, never assumed: a theme covered only by the Assemblée
 * nationale must not advertise Senate scrutins it does not carry.
 */
export interface ThemeChamberCoverage {
  hasAN: boolean;
  hasSenat: boolean;
}

/** "à l'Assemblée nationale et au Sénat" — null when no chamber is covered. */
function chamberSuffix(coverage: ThemeChamberCoverage): string | null {
  if (coverage.hasAN && coverage.hasSenat) return "à l'Assemblée nationale et au Sénat";
  if (coverage.hasAN) return "à l'Assemblée nationale";
  if (coverage.hasSenat) return "au Sénat";
  return null;
}

/** "les votes de l'Assemblée nationale et du Sénat" — null when no chamber is covered. */
function chamberVotesClause(coverage: ThemeChamberCoverage): string | null {
  if (coverage.hasAN && coverage.hasSenat) return "les votes de l'Assemblée nationale et du Sénat";
  if (coverage.hasAN) return "les votes de l'Assemblée nationale";
  if (coverage.hasSenat) return "les votes du Sénat";
  return null;
}

/** "scrutins de l'Assemblée nationale et du Sénat" — null when no chamber is covered. */
function chamberScrutinsClause(coverage: ThemeChamberCoverage): string | null {
  if (coverage.hasAN && coverage.hasSenat) return "scrutins de l'Assemblée nationale et du Sénat";
  if (coverage.hasAN) return "scrutins de l'Assemblée nationale";
  if (coverage.hasSenat) return "scrutins du Sénat";
  return null;
}

/**
 * Landing title. Names the chambers actually covered, so the page answers the
 * real query ("votes sur la santé à l'Assemblée nationale") instead of the bare
 * label. Falls back to a chamber-free form when the theme carries no scrutin.
 */
export function buildThemeTitle(theme: ThemeCategory, coverage: ThemeChamberCoverage): string {
  const phrase = themeSeoPhrase(theme);
  const suffix = chamberSuffix(coverage);
  return suffix ? `Votes sur ${phrase} ${suffix}` : `Votes parlementaires sur ${phrase}`;
}

export function buildThemeDescription(
  theme: ThemeCategory,
  coverage: ThemeChamberCoverage
): string {
  const phrase = themeSeoPhrase(theme);
  const scrutins = chamberScrutinsClause(coverage);
  return scrutins
    ? `Consultez les votes du Parlement sur ${phrase} : ${scrutins}, résultats, textes de loi et amendements.`
    : `Consultez les votes du Parlement sur ${phrase} : scrutins, résultats, textes de loi et amendements.`;
}

/** Explicit H1, kept short: the theme label alone says nothing about the page. */
export function buildThemeH1(theme: ThemeCategory): string {
  return `Votes parlementaires sur ${themeSeoPhrase(theme)}`;
}

export interface ThemeIntroInput {
  theme: ThemeCategory;
  /** Scrutins referenced in the currently displayed perimeter. */
  total: number;
  /** Share of adopted scrutins in that same perimeter, already rounded. */
  adoptedPercent: number;
  /** Formatted date of the most recent scrutin, or null when unknown. */
  lastVoteDateLabel: string | null;
  coverage: ThemeChamberCoverage;
}

/**
 * Visible intro: deterministic, derived from counts already displayed on the
 * page. No interpretation of the votes, no generated editorial text, and no
 * chamber mentioned that the data does not cover.
 */
export function buildThemeIntro({
  theme,
  total,
  adoptedPercent,
  lastVoteDateLabel,
  coverage,
}: ThemeIntroInput): string {
  const phrase = themeSeoPhrase(theme);

  if (total <= 0) {
    return `Aucun scrutin sur ${phrase} n'est référencé à ce jour.`;
  }

  const count = total.toLocaleString("fr-FR");
  const sentences: string[] = [
    total > 1
      ? `${count} scrutins parlementaires sur ${phrase} sont référencés, dont ${adoptedPercent} % adoptés.`
      : `${count} scrutin parlementaire sur ${phrase} est référencé, dont ${adoptedPercent} % adoptés.`,
  ];

  if (lastVoteDateLabel) {
    sentences.push(`Dernier scrutin : ${lastVoteDateLabel}.`);
  }

  const votes = chamberVotesClause(coverage);
  if (votes) {
    sentences.push(`Retrouvez ${votes}, les textes de loi et les amendements concernés.`);
  }

  return sentences.join(" ");
}
