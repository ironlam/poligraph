import type { AffairStatus } from "@/generated/prisma";

type OpenStatus =
  | "ENQUETE_PRELIMINAIRE"
  | "INSTRUCTION"
  | "INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN"
  | "MISE_EN_EXAMEN"
  | "RENVOI_TRIBUNAL"
  | "PROCES_EN_COURS"
  | "CONDAMNATION_PREMIERE_INSTANCE"
  | "APPEL_EN_COURS"
  | "POURVOI_EN_CASSATION";

type TerminalStatus =
  | "CONDAMNATION_DEFINITIVE"
  | "RELAXE"
  | "ACQUITTEMENT"
  | "NON_LIEU"
  | "PRESCRIPTION"
  | "CLASSEMENT_SANS_SUITE";

// Compile error if a new AffairStatus is neither open nor terminal.
type Unclassified = Exclude<AffairStatus, OpenStatus | TerminalStatus>;
const _allClassified: [Unclassified] extends [never] ? true : never = true;
void _allClassified;

/** Months between two reviews of an open affair. */
const REVIEW_MONTHS: Record<OpenStatus, 1 | 3 | 6> = {
  PROCES_EN_COURS: 1,
  APPEL_EN_COURS: 1,
  RENVOI_TRIBUNAL: 3,
  CONDAMNATION_PREMIERE_INSTANCE: 3,
  POURVOI_EN_CASSATION: 3,
  ENQUETE_PRELIMINAIRE: 6,
  INSTRUCTION: 6,
  MISE_EN_EXAMEN: 6,
  INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN: 6,
};

const TERMINAL_KEYS: Record<TerminalStatus, true> = {
  CONDAMNATION_DEFINITIVE: true,
  RELAXE: true,
  ACQUITTEMENT: true,
  NON_LIEU: true,
  PRESCRIPTION: true,
  CLASSEMENT_SANS_SUITE: true,
};

/** One last review after the appeal window, then monitoring stops. */
const TERMINAL_FINAL_REVIEW_MONTHS = 2;

export const OPEN_STATUSES: ReadonlySet<AffairStatus> = new Set(
  Object.keys(REVIEW_MONTHS) as OpenStatus[]
);
export const TERMINAL_STATUSES: ReadonlySet<AffairStatus> = new Set(
  Object.keys(TERMINAL_KEYS) as TerminalStatus[]
);

const PARIS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar day in Paris, as 00:00 UTC of that day. */
export function parisDay(now: Date): Date {
  return new Date(`${PARIS_DAY.format(now)}T00:00:00Z`);
}

/** Adds months to a UTC day, clamping to the last day of the target month. */
export function addMonthsUtc(day: Date, months: number): Date {
  const y = day.getUTCFullYear();
  const m = day.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day.getUTCDate(), lastDay)));
}

/** Next review date for a status; `from` is a Paris day (00:00 UTC). */
export function computeCadenceReview(
  status: AffairStatus,
  from: Date
): { nextReviewAt: Date; dueReason: "CADENCE" | "DELAI_RECOURS" } {
  if (status in TERMINAL_KEYS) {
    return {
      nextReviewAt: addMonthsUtc(from, TERMINAL_FINAL_REVIEW_MONTHS),
      dueReason: "DELAI_RECOURS",
    };
  }
  return {
    nextReviewAt: addMonthsUtc(from, REVIEW_MONTHS[status as OpenStatus]),
    dueReason: "CADENCE",
  };
}
