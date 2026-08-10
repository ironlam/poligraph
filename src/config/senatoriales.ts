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
 * Candidacy deposit period for the 27 September 2026 renewal, as calendar dates.
 *
 * Article 2 of décret n° 2026-301 fixes "le vendredi 11 septembre 2026 à dix-huit heures",
 * but that hour is *local* to the services of the State's representative where the
 * declaration is filed. Article 1 convenes circonscriptions spanning Wallis-et-Futuna
 * (UTC+12) to Polynésie française (UTC-10), so 18 h falls about twenty-two hours apart
 * between the two extremes and no single instant closes the period nationally.
 *
 * Encoding one universal instant would therefore assert something false somewhere for most
 * of a day. The hub reasons on calendar dates instead, and the 18 h appears only in the
 * copy, attached to the circonscription where the deposit happens.
 *
 * Deliberately not read from `Election.candidacyDeadline`: what that generic column should
 * hold for a ballot with per-territory local hours is an open question, and this hub must
 * not settle it by side effect. A test pins these dates against the seeded column so the
 * two cannot drift apart at day precision.
 */
export interface CandidacyPeriodConfig {
  firstDay: string;
  lastDay: string;
  opensAt: Date;
  closesAt: Date;
}

export const CANDIDACY_PERIOD: CandidacyPeriodConfig = {
  /** First day declarations are received, ISO YYYY-MM-DD, for display. */
  firstDay: "2026-09-07",
  /** Last day declarations are received, until 18 h local, for display. */
  lastDay: "2026-09-11",

  /**
   * Bounds of the union of every local window, not a national hour.
   *
   * Comparing the Paris calendar day was still wrong, just wrong by less: it flipped to
   * "terminé" at midnight in Paris while a deposit in Polynésie française had six hours
   * left. The rule now is that the period is open while it is open **anywhere**, so the
   * page can never deny a window that is genuinely still open.
   *
   * `opensAt` is 7 September 00:00 in Wallis-et-Futuna (UTC+12), the earliest the day
   * begins among the convened circonscriptions. `closesAt` is 11 September 18:00 in
   * Polynésie française (UTC-10), where the haut-commissariat receiving the declarations
   * sits, the latest the hour falls.
   *
   * These are instants, unlike the earlier attempt, but they are derived from the extremes
   * of the local windows instead of inventing one national 18 h.
   */
  opensAt: new Date("2026-09-06T12:00:00Z"),
  closesAt: new Date("2026-09-12T04:00:00Z"),
};

/**
 * The Français établis hors de France are a separate regime at every step.
 *
 * Article 1 of décret n° 2026-301 does not convene them, so nothing above applies to them.
 * Their own standing texts do, and both are in force:
 *
 * - article 46 of loi n° 2013-659 of 22 July 2013: "Les déclarations de candidature sont
 *   déposées au ministère des affaires étrangères au plus tard le troisième lundi qui
 *   précède le scrutin, à 18 heures." Third Monday before Sunday 27 September 2026 is
 *   Monday 7 September, the very day the general period opens elsewhere.
 * - article 50 of décret n° 2014-290 of 4 March 2014: "Le scrutin est ouvert à 9 heures et
 *   clos à 15 heures. Toutefois, si le président du bureau de vote constate que tous les
 *   membres du collège électoral ont pris part au vote, il peut déclarer le scrutin clos
 *   avant l'heure fixée ci-dessus."
 *
 * Unlike the 63 other circonscriptions, this deadline **is** a single instant: there is one
 * filing place, the ministère in Paris, so 18 h there is 16:00 UTC and nothing is local
 * about it. The asymmetry is the point.
 */
export const FEHF_REGIME = {
  /** Single instant: one filing place, in Paris. */
  candidacyDeadline: new Date("2026-09-07T16:00:00Z"),
  candidacyDeadlineLabel: "le lundi 7 septembre 2026 à 18 h",
  candidacyPlace: "au ministère des Affaires étrangères",
  pollHours: "de 9 h à 15 h",
  /** Six of the twelve FEHF seats are renewed at each partial renewal. */
  seatsAtStake: 6,
} as const;

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

/**
 * Article L. 284: below 9,000 inhabitants the council elects delegates from among
 * its members, on a scale keyed on the council size, not on the population.
 *
 * Text in force since 23 March 2014: one delegate for councils of seven and eleven
 * members, three for fifteen, five for nineteen, seven for twenty-three, fifteen for
 * twenty-seven and twenty-nine. The sizes match the L. 2121-2 CGCT scale that
 * `scripts/seed-communes.ts` applies, so every commune under 9,000 lands on one of
 * these keys.
 *
 * @see https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000027433875
 */
export const SENATE_DELEGATE_SCALE: Record<number, number> = {
  7: 1,
  11: 1,
  15: 3,
  19: 5,
  23: 7,
  27: 15,
  29: 15,
};

/**
 * Article L. 285 thresholds: at or above this population every councillor is a
 * delegate by right, and above `SUPPLEMENTARY_DELEGATE_FLOOR` the council elects one
 * extra delegate per complete `SUPPLEMENTARY_DELEGATE_STEP` inhabitants beyond it.
 *
 * @see https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000027804508
 */
export const DELEGATES_BY_RIGHT_THRESHOLD = 9000;
export const SUPPLEMENTARY_DELEGATE_FLOOR = 30000;
export const SUPPLEMENTARY_DELEGATE_STEP = 800;
