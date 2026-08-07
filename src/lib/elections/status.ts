import type { ElectionStatus } from "@/types";

/**
 * Election.status is a stored column with no automatic transition: the only
 * writer is the candidacy sync, which pins it to CANDIDACIES after an import.
 * Once the ballot has been held the stored value rots, so the phases that dates
 * alone can prove are derived at read time instead of being trusted from the DB.
 *
 * Only post-round phases are derived. Everything before the first round
 * (REGISTRATION, CANDIDACIES, CAMPAIGN) stays editorially curated.
 */

const PHASE_ORDER: ElectionStatus[] = [
  "UPCOMING",
  "REGISTRATION",
  "CANDIDACIES",
  "CAMPAIGN",
  "ROUND_1",
  "BETWEEN_ROUNDS",
  "ROUND_2",
  "COMPLETED",
];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ElectionStatusInput {
  status: ElectionStatus;
  round1Date: Date | null;
  round2Date: Date | null;
}

/**
 * Round dates are stored at midnight UTC, so a polling day spans
 * [date, date + 24h) in UTC — about 02:00 to 02:00 Paris time in summer.
 * Day-level precision is what a status badge needs.
 */
function isPollingDay(now: Date, date: Date): boolean {
  const start = date.getTime();
  return now.getTime() >= start && now.getTime() < start + DAY_MS;
}

function isPast(now: Date, date: Date): boolean {
  return now.getTime() >= date.getTime() + DAY_MS;
}

function deriveFromDates(election: ElectionStatusInput, now: Date): ElectionStatus | null {
  const { round1Date, round2Date } = election;

  if (round2Date) {
    if (isPast(now, round2Date)) return "COMPLETED";
    if (isPollingDay(now, round2Date)) return "ROUND_2";
  }

  if (round1Date) {
    if (isPast(now, round1Date)) return round2Date ? "BETWEEN_ROUNDS" : "COMPLETED";
    if (isPollingDay(now, round1Date)) return "ROUND_1";
  }

  return null;
}

/**
 * Resolve the phase actually reached by an election, combining what is stored
 * with what its round dates prove. Never downgrades: an election flagged
 * COMPLETED by an editor stays COMPLETED even if a second round was scheduled
 * and never held.
 */
export function resolveElectionStatus(
  election: ElectionStatusInput,
  now: Date = new Date()
): ElectionStatus {
  const derived = deriveFromDates(election, now);
  if (!derived) return election.status;

  return PHASE_ORDER.indexOf(derived) > PHASE_ORDER.indexOf(election.status)
    ? derived
    : election.status;
}

/** An election is over once its resolved phase is COMPLETED. */
export function isElectionOver(election: ElectionStatusInput, now: Date = new Date()): boolean {
  return resolveElectionStatus(election, now) === "COMPLETED";
}
