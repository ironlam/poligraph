import { INSEE_NATIONAL_SOURCES } from "@/config/populations-reference";
import type { PopulationSeriesPoint } from "@/lib/data/commune-population";

/**
 * Evolution of the municipal population between two vintages (#1052, "Le territoire en chiffres").
 * Pure: no data access.
 *
 * Refused, not approximated, whenever the two figures are not on the same footing. The "same
 * perimeter" claim rests on the national INSEE files: the importer drops, never adjusts, a row
 * whose code designates another territory in the older file (populations-plan.ts). A series from
 * another producer (overseas institutes) carries no such check, so it gets no evolution.
 */

export type EvolutionRefusal =
  | "UN_SEUL_MILLESIME"
  | "PRODUCTEURS_DIFFERENTS"
  | "MILLESIMES_INCOMPARABLES"
  | "SERIE_HORS_FICHIERS_NATIONAUX";

export type PopulationEvolution =
  | {
      ok: true;
      from: { millesime: number; value: number };
      to: { millesime: number; value: number };
    }
  | { ok: false; reason: EvolutionRefusal };

const NATIONAL_MILLESIMES: ReadonlySet<number> = new Set(
  INSEE_NATIONAL_SOURCES.map((s) => s.millesime)
);

/** `series` is newest first, as read. Raw values only: no percentage, no arrow, no colour. */
export function populationEvolution(series: PopulationSeriesPoint[]): PopulationEvolution {
  const [to, from] = series;
  if (!to || !from) return { ok: false, reason: "UN_SEUL_MILLESIME" };
  if (to.producer !== from.producer) return { ok: false, reason: "PRODUCTEURS_DIFFERENTS" };
  if (to.millesime <= from.millesime) return { ok: false, reason: "MILLESIMES_INCOMPARABLES" };
  if (to.producer !== "INSEE" || !NATIONAL_MILLESIMES.has(to.millesime)) {
    return { ok: false, reason: "SERIE_HORS_FICHIERS_NATIONAUX" };
  }
  if (!NATIONAL_MILLESIMES.has(from.millesime)) {
    return { ok: false, reason: "SERIE_HORS_FICHIERS_NATIONAUX" };
  }
  return {
    ok: true,
    from: { millesime: from.millesime, value: from.value },
    to: { millesime: to.millesime, value: to.value },
  };
}

const count = (n: number) => n.toLocaleString("fr-FR");

/** The one sentence the block shows, in the neutral wording of the kit. */
export function evolutionSentence(e: Extract<PopulationEvolution, { ok: true }>): string {
  const head = `Entre les populations de référence ${e.from.millesime} et ${e.to.millesime}, la population municipale`;
  if (e.from.value === e.to.value) {
    return `${head} est restée à ${count(e.to.value)} habitants, à périmètre communal constant.`;
  }
  return `${head} est passée de ${count(e.from.value)} à ${count(e.to.value)} habitants, à périmètre communal constant.`;
}
