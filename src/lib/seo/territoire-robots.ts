import type { Metadata } from "next";
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
 * Budget sub-pages (/territoires/.../budget, lot C): noindex,follow until their indexing is
 * decided on production counts once the accounts are published (AGENTS.md §5). Out of the
 * sitemap meanwhile. A series of figures repeated on 10 000 commune pages is the near-duplicate
 * case the doctrine warns about, so the default is to withhold them.
 */
export const TERRITOIRE_BUDGET_ROBOTS = { robots: { index: false, follow: true } } as const;

/** `robots` fragment for a Territoires commune page: {} when indexable, noindex,follow otherwise. */
export function territoireCommuneRobotsMetadata(
  signals: TerritoireCommuneIndexSignals
): Pick<Metadata, "robots"> {
  return isIndexableTerritoireCommune(signals) ? {} : { robots: NOINDEX_FOLLOW };
}
