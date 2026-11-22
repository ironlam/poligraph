import type { Metadata } from "next";
import { COMPTES_ABSENCES } from "@/config/territoire-comptes";
import type { RepereTerritoryKind } from "@/config/territoire-reperes";
import { COMMUNE_MIN_POPULATION } from "./commune-robots";

const NOINDEX_FOLLOW = { index: false, follow: true } as const;

/**
 * Population floor for indexing a Territoires commune page. Same figure as the municipales
 * threshold, imported rather than repeated so the two cannot drift apart silently.
 *
 * The reason is NOT the ballot: since the 2026 municipales the list ballot applies below
 * 1,000 inhabitants too, so panachage no longer separates small communes. This is an editorial
 * trade-off: the index is limited to the communes whose page carries the most material
 * (detailed list results, larger councils), and every other commune page stays reachable and
 * crawlable through `noindex,follow`.
 */
export const TERRITOIRE_COMMUNE_MIN_POPULATION = COMMUNE_MIN_POPULATION;

export interface TerritoireCommuneIndexSignals {
  population: number | null | undefined;
  /** True only when exactly one current mayor is recorded and that profile is public. */
  maireEtabli: boolean;
}

/**
 * Indexable when the population is known and at least the floor, AND a public mayor is
 * established. Unknown population is noindex,follow: unlike the municipales page, this one is
 * not presumed rich, and nothing measured says it is. Shared by the page metadata, the sitemap
 * and the tests (AGENTS.md §5, single source of truth).
 */
export function isIndexableTerritoireCommune(signals: TerritoireCommuneIndexSignals): boolean {
  if (signals.population == null) return false;
  return signals.population >= TERRITOIRE_COMMUNE_MIN_POPULATION && signals.maireEtabli;
}

/**
 * Budget sub-pages (/territoires/.../budget, lot C), decided on 2026-11-22 on production counts
 * after publication: 10 218 pages, 10 099 of them communes. The 101 departments and 18 regions
 * are indexable: few, each the accounts of a distinct collectivity. The communes stay
 * noindex,follow: one series template repeated on 10 000 pages is the near-duplicate case the
 * doctrine warns about (AGENTS.md §5). A department or region whose page only says why it has no
 * accounts of its own (single collectivity, Mayotte) is thin and stays out too. The sitemap reads
 * this predicate.
 */
export function isIndexableTerritoireBudget(scale: RepereTerritoryKind, code: string): boolean {
  return scale !== "COM" && !(code in COMPTES_ABSENCES[scale]);
}

/** `robots` fragment for a /budget sub-page: {} when indexable, noindex,follow otherwise. */
export function territoireBudgetRobotsMetadata(
  scale: RepereTerritoryKind,
  code: string
): Pick<Metadata, "robots"> {
  return isIndexableTerritoireBudget(scale, code) ? {} : { robots: NOINDEX_FOLLOW };
}

/** `robots` fragment for a Territoires commune page: {} when indexable, noindex,follow otherwise. */
export function territoireCommuneRobotsMetadata(
  signals: TerritoireCommuneIndexSignals
): Pick<Metadata, "robots"> {
  return isIndexableTerritoireCommune(signals) ? {} : { robots: NOINDEX_FOLLOW };
}
