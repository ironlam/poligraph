import type { Metadata } from "next";

const NOINDEX_FOLLOW = { index: false, follow: true } as const;

/**
 * Mandate types that make a politician profile indexable on their own:
 * national/European/government offices and executive heads. Local mandates
 * (MAIRE, conseillers...) are NOT sufficient by themselves: ~34k RNE-imported
 * mayors have a bare profile (no bio, no affair, no vote) that Google refuses
 * to index ("Explorée, actuellement non indexée", issue #385).
 *
 * DEPUTE is deliberately absent. A deputy mandate says nothing about the content of the page:
 * the fiches of former deputies created from the official archive (#1131) carry a mandate and
 * votes but no biography, and a fiche without validated biography stays noindex. A deputy with a
 * biography, a declaration or any other signal below is indexable through that signal.
 */
export const SIGNIFICANT_MANDATE_TYPES = [
  "SENATEUR",
  "DEPUTE_EUROPEEN",
  "PRESIDENT_REPUBLIQUE",
  "PREMIER_MINISTRE",
  "MINISTRE",
  "MINISTRE_DELEGUE",
  "SECRETAIRE_ETAT",
  "PRESIDENT_REGION",
  "PRESIDENT_DEPARTEMENT",
  "PRESIDENT_PARTI",
] as const;

/** Mayors of communes at or above this population stay indexable (real nominative search demand). */
export const MAIRE_MIN_COMMUNE_POPULATION = 10_000;

/** Minimum trimmed biography length to count as real editorial content. */
export const MIN_BIOGRAPHY_LENGTH = 50;

const SIGNIFICANT_SET: ReadonlySet<string> = new Set(SIGNIFICANT_MANDATE_TYPES);

export interface PoliticianIndexSignals {
  mandates: ReadonlyArray<{ type: string; communePopulation?: number | null }>;
  publishedAffairsCount: number;
  factCheckMentionsCount: number;
  declarationsCount: number;
  biography: string | null;
}

/**
 * True when the profile carries at least one real content signal.
 * Mirrors the SQL filter of the politicians sitemap (src/app/sitemap.ts,
 * buildStaticAndPoliticiansSitemap) — keep both in sync.
 */
export function isIndexablePolitician(signals: PoliticianIndexSignals): boolean {
  // MAIRE with unknown commune population (missing MandateLocal/commune link,
  // ~36 mandates in prod) is fail-open: never deindex a real mayor because of
  // a data gap. Same philosophy as commune-robots.
  const hasSignificantMandate = signals.mandates.some(
    (m) =>
      SIGNIFICANT_SET.has(m.type) ||
      (m.type === "MAIRE" &&
        (m.communePopulation == null || m.communePopulation >= MAIRE_MIN_COMMUNE_POPULATION))
  );
  return (
    hasSignificantMandate ||
    signals.publishedAffairsCount > 0 ||
    signals.factCheckMentionsCount > 0 ||
    signals.declarationsCount > 0 ||
    (signals.biography ?? "").trim().length >= MIN_BIOGRAPHY_LENGTH
  );
}

/**
 * `robots` metadata fragment for a politician profile: {} for rich profiles
 * (inherits the site default index:true), noindex,follow for bare ones.
 * Spread into the page's generateMetadata return.
 */
export function politicianRobotsMetadata(
  signals: PoliticianIndexSignals
): Pick<Metadata, "robots"> {
  return isIndexablePolitician(signals) ? {} : { robots: NOINDEX_FOLLOW };
}
