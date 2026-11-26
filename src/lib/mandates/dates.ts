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
