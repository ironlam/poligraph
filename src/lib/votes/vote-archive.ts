import { ROUTES } from "@/config/routes";

/**
 * The monthly archive of scrutins: pure helpers shared by the pages, the sitemap and the tests.
 * A month is addressed as /parlement/votes/archives/2025/11.
 */

export interface ArchiveMonth {
  year: number;
  /** 1 to 12. */
  month: number;
}

/**
 * Reads the two URL segments of a month. Strict on purpose: "2025/3", "2025/03x" and "2025/13"
 * are not alternate spellings of a page, they are 404s, so a month has exactly one address.
 */
export function parseArchiveMonth(annee: string, mois: string): ArchiveMonth | null {
  if (!/^\d{4}$/.test(annee) || !/^(0[1-9]|1[0-2])$/.test(mois)) return null;
  return { year: Number(annee), month: Number(mois) };
}

export function voteArchiveMonthPath({ year, month }: ArchiveMonth): string {
  return `${ROUTES.voteArchives}/${year}/${String(month).padStart(2, "0")}`;
}

/** The month of a YYYY-MM-DD day, to link a daily page up to its archive. */
export function archiveMonthOfDay(day: string): ArchiveMonth {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}

/** First instant of the month and of the next one, in UTC like the daily pages. */
export function archiveMonthRange({ year, month }: ArchiveMonth): { start: Date; end: Date } {
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

/** "novembre 2025". */
export function formatArchiveMonth({ year, month }: ArchiveMonth): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
