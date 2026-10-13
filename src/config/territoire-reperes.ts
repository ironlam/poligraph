/**
 * Indicators of "Le territoire en chiffres" (#1052, kit v3). Free of server imports: the block,
 * the method pages and the tests read the same definitions.
 *
 * An indicator is added here and as rows in `TerritoireRepere`, never as a table. R4 to R7 (water,
 * housing, recorded crime, air) are not listed on purpose: they wait for their licences, and a
 * theme with no indicator is not shown.
 */

export type RepereTheme = "DEMOGRAPHIE" | "LOGEMENT" | "ENVIRONNEMENT" | "SECURITE";

export const REPERE_THEME_LABELS: Record<RepereTheme, string> = {
  DEMOGRAPHIE: "Démographie",
  LOGEMENT: "Logement",
  ENVIRONNEMENT: "Environnement",
  SECURITE: "Sécurité",
};

export type RepereTerritoryKind = "COM" | "DEP" | "REG";

export interface RepereIndicator {
  key: string;
  theme: RepereTheme;
  label: string;
  unit: string;
  /** Scales where the indicator exists. Elsewhere it reads "non applicable à cette échelle". */
  scales: readonly RepereTerritoryKind[];
  /** Slug of the public method page, /territoires/methode/[slug]. */
  methodSlug: string;
}

/** The six age bands of the INSEE structure, in display order. */
export const AGE_BANDS = [
  { key: "age_tranche_0_14", label: "0 à 14 ans" },
  { key: "age_tranche_15_29", label: "15 à 29 ans" },
  { key: "age_tranche_30_44", label: "30 à 44 ans" },
  { key: "age_tranche_45_59", label: "45 à 59 ans" },
  { key: "age_tranche_60_74", label: "60 à 74 ans" },
  { key: "age_tranche_75_plus", label: "75 ans et plus" },
] as const;

export const REPERE_INDICATORS: readonly RepereIndicator[] = [
  {
    key: "population_municipale",
    theme: "DEMOGRAPHIE",
    label: "Population municipale",
    unit: "habitants",
    scales: ["COM", "DEP", "REG"],
    methodSlug: "population",
  },
  ...AGE_BANDS.map(
    (b): RepereIndicator => ({
      key: b.key,
      theme: "DEMOGRAPHIE",
      label: `Part des ${b.label}`,
      unit: "%",
      scales: ["COM", "DEP", "REG"],
      methodSlug: "structure-par-age",
    })
  ),
  {
    key: "climat_temp_moyenne",
    theme: "ENVIRONNEMENT",
    label: "Température moyenne annuelle (normales 1991-2020)",
    unit: "°C",
    scales: ["COM", "DEP"],
    methodSlug: "climat",
  },
  {
    key: "climat_precipitations",
    theme: "ENVIRONNEMENT",
    label: "Précipitations annuelles (normales 1991-2020)",
    unit: "mm",
    scales: ["COM", "DEP"],
    methodSlug: "climat",
  },
];

export function repereIndicator(key: string): RepereIndicator | undefined {
  return REPERE_INDICATORS.find((i) => i.key === key);
}

/** A climate station further than this from the commune is not its reference (to calibrate). */
export const CLIMAT_STATION_MAX_KM = 30;
