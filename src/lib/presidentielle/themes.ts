import type { ThemeCategory } from "@/generated/prisma";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import { themeFromSlug, themeToSlug } from "@/lib/theme-utils";

export { themeToSlug } from "@/lib/theme-utils";

export const PRESIDENTIELLE_2027_SLUG = "presidentielle-2027";

/** Taxonomie propre aux mesures présidentielles 2027. SOCIAL_TRAVAIL reste parlementaire. */
export const THEMES_IN_ORDER = [
  "LOGEMENT_URBANISME",
  "SANTE",
  "EMPLOI_TRAVAIL",
  "RETRAITES",
  "SOLIDARITES_PROTECTION_SOCIALE",
  "ECONOMIE_BUDGET",
  "ENVIRONNEMENT_ENERGIE",
  "SECURITE_JUSTICE",
  "SOCIETE_DROITS_LIBERTES",
  "EDUCATION_CULTURE",
  "IMMIGRATION",
  "TRANSPORTS",
  "AGRICULTURE_ALIMENTATION",
  "NUMERIQUE_TECH",
  "AFFAIRES_ETRANGERES_DEFENSE",
  "INSTITUTIONS",
] as const satisfies readonly ThemeCategory[];

export type PresidentialThemeCategory = (typeof THEMES_IN_ORDER)[number];
export type PresidentialThemeRouteCategory = PresidentialThemeCategory | "SOCIAL_TRAVAIL";

const PRESIDENTIAL_THEME_SET = new Set<string>(THEMES_IN_ORDER);
const PRESIDENTIAL_THEME_ROUTE_SET = new Set<string>([...THEMES_IN_ORDER, "SOCIAL_TRAVAIL"]);

export function isPresidentialTheme(theme: string): theme is PresidentialThemeCategory {
  return PRESIDENTIAL_THEME_SET.has(theme);
}

/** A Measure attached to the 2027 presidential election must use this narrower taxonomy. */
export function isAllowedPresidentialMeasureTheme(
  electionSlug: string,
  theme: ThemeCategory
): boolean {
  return electionSlug !== PRESIDENTIELLE_2027_SLUG || isPresidentialTheme(theme);
}

/**
 * Read compatibility while production still contains legacy presidential measures.
 * SOCIAL_TRAVAIL remains forbidden for new writes and disappears from indexes as soon as the
 * reclassification batch has emptied it.
 */
export function isReadablePresidentialMeasureTheme(
  electionSlug: string,
  theme: ThemeCategory
): theme is PresidentialThemeRouteCategory {
  return electionSlug !== PRESIDENTIELLE_2027_SLUG || PRESIDENTIAL_THEME_ROUTE_SET.has(theme);
}

export function parseThemeSlug(slug: string): PresidentialThemeRouteCategory | null {
  const theme = themeFromSlug(slug);
  return theme !== null && PRESIDENTIAL_THEME_ROUTE_SET.has(theme)
    ? (theme as PresidentialThemeRouteCategory)
    : null;
}

export function getPresidentialThemeIndexOrder(
  presentThemes: ReadonlySet<ThemeCategory>
): readonly PresidentialThemeRouteCategory[] {
  return presentThemes.has("SOCIAL_TRAVAIL")
    ? [...THEMES_IN_ORDER, "SOCIAL_TRAVAIL"]
    : THEMES_IN_ORDER;
}

export const PRESIDENTIAL_THEME_SEARCH_ALIASES: Record<
  PresidentialThemeCategory,
  readonly string[]
> = {
  LOGEMENT_URBANISME: ["habitat", "loyers", "construction", "urbanisme"],
  SANTE: ["soins", "hôpital", "médecins", "prévention"],
  EMPLOI_TRAVAIL: ["emploi", "travail", "chômage", "salaires"],
  RETRAITES: ["retraite", "pensions", "âge de départ"],
  SOLIDARITES_PROTECTION_SOCIALE: [
    "solidarité",
    "protection sociale",
    "prestations",
    "handicap",
    "pauvreté",
  ],
  ECONOMIE_BUDGET: ["économie", "budget", "fiscalité", "entreprises", "pouvoir d'achat"],
  ENVIRONNEMENT_ENERGIE: ["écologie", "climat", "énergie", "biodiversité"],
  SECURITE_JUSTICE: ["sécurité", "police", "justice", "prisons"],
  SOCIETE_DROITS_LIBERTES: [
    "société",
    "droits",
    "libertés",
    "égalité",
    "discriminations",
    "famille",
  ],
  EDUCATION_CULTURE: ["éducation", "école", "université", "culture", "sport"],
  IMMIGRATION: ["immigration", "asile", "frontières", "nationalité", "intégration"],
  TRANSPORTS: ["transport", "mobilité", "train", "routes", "automobile"],
  AGRICULTURE_ALIMENTATION: ["agriculture", "alimentation", "pêche", "ruralité"],
  NUMERIQUE_TECH: ["numérique", "technologies", "intelligence artificielle", "cybersécurité"],
  AFFAIRES_ETRANGERES_DEFENSE: ["international", "diplomatie", "défense", "armée", "europe"],
  INSTITUTIONS: ["institutions", "constitution", "démocratie", "élections", "collectivités"],
};

function normalizeThemeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Search the controlled subject taxonomy without duplicating it in the full-text index. */
export function findMatchingThemes(query: string): ThemeCategory[] {
  const normalized = normalizeThemeSearch(query);
  if (normalized.length < 2) return [];

  const queryTerms = normalized.split(" ");
  return THEMES_IN_ORDER.filter((theme) => {
    const searchable = normalizeThemeSearch(
      `${THEME_CATEGORY_LABELS[theme]} ${themeToSlug(theme)} ${PRESIDENTIAL_THEME_SEARCH_ALIASES[theme].join(" ")}`
    );
    const subjectTerms = searchable.split(" ");
    return queryTerms.every((queryTerm) =>
      subjectTerms.some(
        (subjectTerm) =>
          subjectTerm === queryTerm || (queryTerm.length >= 3 && subjectTerm.startsWith(queryTerm))
      )
    );
  });
}

/** Find subjects named inside a full sentence, instead of treating every word as a filter. */
export function findThemesMentionedInQuery(query: string): ThemeCategory[] {
  const queryTerms = new Set(normalizeThemeSearch(query).split(" ").filter(Boolean));
  if (queryTerms.size === 0) return [];

  return THEMES_IN_ORDER.filter((theme) => {
    const labels = [THEME_CATEGORY_LABELS[theme], ...PRESIDENTIAL_THEME_SEARCH_ALIASES[theme]];
    return labels.some((label) =>
      normalizeThemeSearch(label)
        .split(" ")
        .some((term) => term.length >= 3 && queryTerms.has(term))
    );
  });
}
