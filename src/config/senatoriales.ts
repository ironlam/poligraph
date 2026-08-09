/**
 * Sénatoriales: renewal series and the three special municipal regimes.
 *
 * The Senate renews half its seats every three years. A department belongs
 * entirely to one series; only the Français établis hors de France are split
 * across both (6 seats each). The series can therefore not be derived from a
 * department code alone, and even less from a mandate start date: a senator
 * replacing a resigning one takes the seat mid-cycle without changing series.
 *
 * Source of truth: the `serie` field of https://www.senat.fr/api-senat/senateurs.json
 */

export type SenateSeries = 1 | 2;

/**
 * Normalise the series returned by the Senate API.
 *
 * The API returns a string ("1" / "2") while `SenateurAPI.serie` was typed
 * `number`, so the sync's strict `serie === 1` was always false and the series
 * was never used. Accept both shapes and reject everything else rather than
 * coercing blindly: an unexpected value must surface as absent, not as an
 * arbitrary series.
 */
export function parseSenateSeries(raw: unknown): SenateSeries | null {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (value === 1 || value === 2) return value;
  return null;
}

/**
 * When each series last took office. The ballots were held on 24 September 2023
 * (series 1) and 27 September 2020 (series 2); the terms run from the 1 October
 * that follows.
 *
 * Used as a fallback when no individual date is available, and as the
 * plausibility bound of `npm run audit:senateurs-series`: a senator cannot hold
 * a seat before their series filled it.
 */
const SERIES_TERM_START_ISO: Record<SenateSeries, string> = {
  1: "2023-10-01T00:00:00Z",
  2: "2020-10-01T00:00:00Z",
};

/** Returns a fresh Date: the value is written to the database, never shared. */
export function getSeriesTermStart(series: SenateSeries): Date {
  return new Date(SERIES_TERM_START_ISO[series]);
}

/**
 * Statutory council size for Paris, Lyon and Marseille, by INSEE code.
 *
 * These three cities have their own regime (CGCT, chapters II and III of title I
 * of book V of part two) and escape the generic scale of article L. 2121-2 that
 * `scripts/seed-communes.ts` applies to derive `Commune.totalSeats`. That scale
 * caps at 69 seats, so all three carry 69 in the database instead of their real
 * size. Senatorial delegates are counted from the council size, so reading
 * `totalSeats` raw would understate their college by several hundred votes.
 *
 * Corrected here by explicit derogation rather than by patching the scale: these
 * are distinct legal regimes, not exceptions to a shared rule.
 *
 * Marseille moves from 101 to 111 members as of the March 2026 renewal (2025
 * reform of the PLM voting system).
 *
 * @see https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070633/LEGISCTA000006164590/ (Paris)
 * @see https://www.legifrance.gouv.fr/codes/id/LEGISCTA000006164591 (Lyon and Marseille)
 */
export const PLM_COUNCIL_SEATS: Record<string, number> = {
  "75056": 163, // Conseil de Paris
  "69123": 73, // Conseil municipal de Lyon
  "13055": 111, // Conseil municipal de Marseille, from the 2026 renewal
};

/**
 * Council size to use for a commune.
 *
 * `Commune.totalSeats` is authoritative everywhere except Paris, Lyon, Marseille.
 */
export function getCouncilSeats(communeId: string, totalSeats: number | null): number | null {
  return PLM_COUNCIL_SEATS[communeId] ?? totalSeats;
}
