import type { DatePrecision } from "@/generated/prisma";

export type PartialDate = { date: Date; precision: DatePrecision };

const PARTIAL = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/**
 * Reads "2001", "2001-03" or "2001-03-25". The precision is what was written, never more: a year
 * alone is stored on 1 January with YEAR, a month on the 1st with MONTH. Returns null for
 * anything else, including a day that does not exist (2001-02-30).
 */
export function parsePartialDate(input: string): PartialDate | null {
  const match = PARTIAL.exec(input.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  const day = match[3] ? Number(match[3]) : 1;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { date, precision: match[3] ? "DAY" : match[2] ? "MONTH" : "YEAR" };
}

/** "2001", "mars 2001" or "25 mars 2001": a mandate date, as precisely as it is known. */
export function formatMandateDate(date: Date | string, precision: DatePrecision): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (precision === "YEAR") return String(d.getUTCFullYear());
  return d.toLocaleDateString("fr-FR", {
    ...(precision === "DAY" ? { day: "numeric" as const } : {}),
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Whether two start dates can be the same event, given how precisely the stored one is known.
 * A mandate known to the year matches any date of that year, to the month any date of that
 * month. A date known to the day keeps the tolerance the callers already used.
 */
export function sameStartWithin(
  stored: Date,
  storedPrecision: DatePrecision,
  other: Date,
  dayTolerance: number
): boolean {
  if (storedPrecision === "YEAR") return stored.getUTCFullYear() === other.getUTCFullYear();
  if (storedPrecision === "MONTH") {
    return (
      stored.getUTCFullYear() === other.getUTCFullYear() &&
      stored.getUTCMonth() === other.getUTCMonth()
    );
  }
  return Math.abs(stored.getTime() - other.getTime()) / 86_400_000 < dayTolerance;
}

/** What the display helpers read of a mandate. Precisions are absent from older profile documents. */
export type MandatePeriod = {
  startDate: Date | string;
  endDate: Date | string | null;
  isCurrent: boolean;
  startDatePrecision?: DatePrecision | null;
  endDatePrecision?: DatePrecision | null;
};

/** A mandate that is over and whose end date nobody recorded. It did not last until today. */
export function hasUnknownEnd(mandate: MandatePeriod): boolean {
  return !mandate.isCurrent && mandate.endDate === null;
}

/**
 * Where a mandate stops on a time axis: its end date, `openEnd` while it is held, and its own
 * start when the end is unknown, so it is drawn as a point rather than stretched to today.
 */
export function mandateAxisEnd(mandate: MandatePeriod, openEnd: Date): Date {
  if (mandate.endDate) return new Date(mandate.endDate);
  return mandate.isCurrent ? openEnd : new Date(mandate.startDate);
}

/** "2001", "mars 2001" or "25 mars 2001", then the end the same way. */
export function formatMandatePeriod(mandate: MandatePeriod, openEndLabel = "Aujourd'hui"): string {
  const start = formatMandateDate(mandate.startDate, mandate.startDatePrecision ?? "DAY");
  const end = mandate.endDate
    ? formatMandateDate(mandate.endDate, mandate.endDatePrecision ?? "DAY")
    : mandate.isCurrent
      ? openEndLabel
      : "fin non connue";
  return `${start} - ${end}`;
}

/**
 * How long a mandate lasted, when that can be said honestly.
 *
 * `preciseDuration` is the caller's own month-level formatter: it only runs when both bounds are
 * known to the day. A bound known to the month or the year gives whole years, counted between
 * calendar years, and nothing under a year. An unknown end gives nothing at all.
 */
export function mandateDuration(
  mandate: MandatePeriod,
  preciseDuration: (start: Date, end: Date) => string,
  now: Date = new Date()
): string | null {
  if (hasUnknownEnd(mandate)) return null;
  const start = new Date(mandate.startDate);
  const end = mandate.endDate ? new Date(mandate.endDate) : now;
  const startPrecise = (mandate.startDatePrecision ?? "DAY") === "DAY";
  const endPrecise = !mandate.endDate || (mandate.endDatePrecision ?? "DAY") === "DAY";
  if (startPrecise && endPrecise) return preciseDuration(start, end);
  const years = end.getUTCFullYear() - start.getUTCFullYear();
  if (years < 1) return null;
  return `${years} an${years > 1 ? "s" : ""}`;
}
