/**
 * Temporal state of the homepage election banner.
 *
 * Deliberately agnostic of the election TYPE: the five states are properties of a one or two
 * round ballot, not of the presidential race. Labels and link targets live in
 * `banner-presentation.ts`, keyed by `ElectionType`.
 *
 * The state machine exists to make one bug unrepresentable: a banner counting down toward a date
 * that has passed. `AFTER` carries no target date at all, so no rendering path can accidentally
 * show a countdown once the last round is over.
 */

/** Paris wall-clock hour at which polling stations open on election day. */
export const POLLS_OPEN_HOUR_PARIS = 8;
/** Paris wall-clock hour at which polling stations close, and at which the banner switches state. */
export const POLLS_CLOSE_HOUR_PARIS = 20;
/** Above this many days before the first round, the banner stays in its low-key `FAR` state. */
export const LAST_MONTH_THRESHOLD_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ElectionRoundScore = {
  candidateName: string;
  politicianSlug: string | null;
  partyLabel: string | null;
  pct: number;
};

export type ElectionBannerState =
  | { kind: "FAR"; targetDate: Date; showSeconds: false }
  | { kind: "LAST_MONTH"; targetDate: Date; showSeconds: false }
  | { kind: "VOTING_DAY"; targetDate: Date; showSeconds: true; round: 1 | 2 }
  | {
      kind: "BETWEEN_ROUNDS";
      targetDate: Date;
      showSeconds: false;
      round1Scores: ElectionRoundScore[];
    }
  | { kind: "AFTER"; winner: ElectionRoundScore | null };

export type DeriveElectionBannerStateInput = {
  round1Date: Date | null;
  round2Date: Date | null;
  now: Date;
  /** The qualified candidacies with their first-round share. Empty until results are imported. */
  round1Scores: ElectionRoundScore[];
  /** The elected candidacy with its second-round share. Null until there is one. */
  winner: ElectionRoundScore | null;
};

/**
 * Minutes to add to a UTC timestamp to read the Europe/Paris wall clock at that instant.
 *
 * Read from the zone rather than hardcoded: Paris is UTC+1 or UTC+2 depending on the season, and
 * a March round falls on the other side of the switch from an April one.
 */
function parisOffsetMinutes(at: Date): number {
  // "en-CA" yields ISO-ordered numeric parts, which recompose deterministically.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asIfUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second")
  );
  return (asIfUtc - at.getTime()) / 60_000;
}

/**
 * The instant at which the Paris wall clock reads `hour`:00 on the calendar day of `day`.
 *
 * `day` is read in UTC because that is how round dates are stored (midnight UTC on the polling
 * day). The two-step guess-then-correct is exact for the hours this module uses: DST switches
 * happen at 02:00/03:00 local, never at 08:00 or 20:00, so the offset at the guessed instant
 * equals the offset at the corrected one.
 */
function parisInstantOnDay(day: Date, hour: number): Date {
  const guess = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour);
  return new Date(guess - parisOffsetMinutes(new Date(guess)) * 60_000);
}

export function deriveElectionBannerState(
  input: DeriveElectionBannerStateInput
): ElectionBannerState | null {
  const { round1Date, round2Date, now, round1Scores, winner } = input;
  if (round1Date === null) return null;

  const round1Open = parisInstantOnDay(round1Date, POLLS_OPEN_HOUR_PARIS);
  const round1Close = parisInstantOnDay(round1Date, POLLS_CLOSE_HOUR_PARIS);
  const lastRound = round2Date ?? round1Date;
  const lastRoundClose = parisInstantOnDay(lastRound, POLLS_CLOSE_HOUR_PARIS);

  // Ordered from the latest situation to the earliest, so each branch only has to rule out what
  // comes after it.
  if (now.getTime() >= lastRoundClose.getTime()) {
    return { kind: "AFTER", winner };
  }

  if (round2Date !== null && now.getTime() >= round1Close.getTime()) {
    // Polls closed on round 1 and round 2 has not closed yet. Voting day of round 2 is the window
    // between midnight and 20:00 on that day; before it, the reader is between rounds.
    const round2DayStart = parisInstantOnDay(round2Date, 0);
    const round2Close = parisInstantOnDay(round2Date, POLLS_CLOSE_HOUR_PARIS);
    if (now.getTime() >= round2DayStart.getTime() && now.getTime() < round2Close.getTime()) {
      return { kind: "VOTING_DAY", targetDate: round2Close, showSeconds: true, round: 2 };
    }
    return {
      kind: "BETWEEN_ROUNDS",
      targetDate: parisInstantOnDay(round2Date, POLLS_OPEN_HOUR_PARIS),
      showSeconds: false,
      round1Scores,
    };
  }

  const round1DayStart = parisInstantOnDay(round1Date, 0);
  if (now.getTime() >= round1DayStart.getTime()) {
    return { kind: "VOTING_DAY", targetDate: round1Close, showSeconds: true, round: 1 };
  }

  const daysUntilOpen = (round1Open.getTime() - now.getTime()) / MS_PER_DAY;
  if (daysUntilOpen >= LAST_MONTH_THRESHOLD_DAYS) {
    return { kind: "FAR", targetDate: round1Open, showSeconds: false };
  }
  return { kind: "LAST_MONTH", targetDate: round1Open, showSeconds: false };
}
