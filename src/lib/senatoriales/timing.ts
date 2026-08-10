/**
 * Where the candidacy deposit period stands, derived at read time.
 *
 * `Election.status` cannot answer this. It is a stored column whose only writer is the
 * candidacy sync, and `resolveElectionStatus()` deliberately derives post-round phases
 * only: everything before the first round stays editorially curated. So a page trusting
 * the column would still announce "dépôt à venir" in October.
 *
 * The period is compared as **calendar dates, not instants**, and that is the whole point.
 * Article 2 of décret n° 2026-301 fixes 18 h on 11 September, but as a local hour at the
 * services of the State's representative in each circonscription, and article 1 convenes
 * circonscriptions from Wallis-et-Futuna (UTC+12) to Polynésie française (UTC-10). A single
 * universal instant would close the period twenty-two hours early at one end or that late
 * at the other. There is no national minute of closure to encode, so none is encoded, and
 * the hub never claims one.
 */

export type CandidacyPhase = "before" | "open" | "closed" | "unknown";

/**
 * Calendar bounds for display, and the union of every local window for the phase.
 *
 * `opensAt` and `closesAt` are the extremes of the local windows, not a national hour: the
 * earliest local start among the convened circonscriptions and the latest local end. See
 * `CANDIDACY_PERIOD` in `src/config/senatoriales.ts` for the offsets they come from.
 */
export interface CandidacyPeriod {
  firstDay: string;
  lastDay: string;
  opensAt: Date;
  closesAt: Date;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar day in Paris, as YYYY-MM-DD. */
function parisDay(date: Date): string {
  return date.toLocaleDateString("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Which side of the deposit period `now` falls on.
 *
 * **The period is open while it is open anywhere.** Comparing the Paris calendar day was
 * still wrong: it announced "terminé" at midnight in Paris while a deposit in Polynésie
 * française had six hours left. Comparing against the union of the local windows means the
 * page can never deny a window that is genuinely still open.
 *
 * The cost is the mirror image, and it is the acceptable one: for a few hours the phase says
 * "en cours" while only the earliest or latest territory is open. That statement is true, and
 * the copy alongside it gives the 7 to 11 September dates and locates the hour, so a reader
 * is never left with a false negative about their own circonscription.
 *
 * Returns "unknown" rather than a guess when the bounds cannot support an answer.
 */
export function deriveCandidacyPhase(period: CandidacyPeriod, now: Date): CandidacyPhase {
  const { firstDay, lastDay, opensAt, closesAt } = period;
  if (!ISO_DAY.test(firstDay) || !ISO_DAY.test(lastDay)) return "unknown";
  if (lastDay < firstDay) return "unknown";
  if (!opensAt || !closesAt) return "unknown";

  const opens = opensAt.getTime();
  const closes = closesAt.getTime();
  const current = now.getTime();
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || !Number.isFinite(current)) {
    return "unknown";
  }
  if (closes <= opens) return "unknown";

  if (current < opens) return "before";
  if (current < closes) return "open";
  return "closed";
}

/**
 * Whether `now` falls on the ballot's own calendar day in Paris.
 *
 * `resolveElectionStatus()` treats a polling day as the 24 hours following a round date
 * stored at midnight UTC, which in September runs from about 02:00 Paris to 02:00 Paris
 * the next day. Saying "aujourd'hui" on that window would keep the claim up for two
 * hours after the day ended.
 *
 * Callers must AND this with the shared phase rather than use it alone, so the
 * refinement can only ever narrow the claim. It never says "today" while the rest of
 * the page still says "à venir": between midnight and 02:00 Paris on the 27th the page
 * stays in its pre-ballot wording, which understates by two hours rather than
 * contradicting itself.
 */
export function isBallotDayInParis(round1Date: Date | null, now: Date): boolean {
  if (!round1Date || !Number.isFinite(round1Date.getTime())) return false;
  if (!Number.isFinite(now.getTime())) return false;
  return parisDay(now) === parisDay(round1Date);
}
