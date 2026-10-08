/**
 * Dates d'étape de procédure : saisie, normalisation et rendu public.
 *
 * Une date est stockée à 00:00 UTC. Sa précision dit ce qu'elle signifie : MONTH impose le jour 1,
 * YEAR impose le 1er janvier. La date n'est jamais affichée sans passer par ce formateur.
 */
import type { AffairEventType, DatePrecision, EventOccurrence } from "@/generated/prisma";
import { parisDay } from "@/lib/affairs/monitoring/cadence";

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

const INPUT_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/** Lit `YYYY`, `YYYY-MM` ou `YYYY-MM-DD` ; `null` si la forme ou le jour n'existe pas. */
export function parseEventDateInput(s: string): { date: Date; precision: DatePrecision } | null {
  const m = INPUT_PATTERN.exec(s.trim());
  if (!m) return null;
  const year = Number(m[1]);
  if (m[2] === undefined) return { date: new Date(Date.UTC(year, 0, 1)), precision: "YEAR" };
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  if (m[3] === undefined) {
    return { date: new Date(Date.UTC(year, month - 1, 1)), precision: "MONTH" };
  }
  const day = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (day < 1 || date.getUTCMonth() !== month - 1) return null;
  return { date, precision: "DAY" };
}

export function normalizeEventDate(date: Date, precision: DatePrecision): Date {
  const y = date.getUTCFullYear();
  if (precision === "YEAR") return new Date(Date.UTC(y, 0, 1));
  if (precision === "MONTH") return new Date(Date.UTC(y, date.getUTCMonth(), 1));
  return new Date(Date.UTC(y, date.getUTCMonth(), date.getUTCDate()));
}

export function isDateConsistent(date: Date, precision: DatePrecision): boolean {
  return normalizeEventDate(date, precision).getTime() === date.getTime();
}

function formatPoint(date: Date, precision: DatePrecision): string {
  const year = date.getUTCFullYear();
  if (precision === "YEAR") return String(year);
  const month = MONTHS[date.getUTCMonth()];
  if (precision === "MONTH") return `${month} ${year}`;
  const day = date.getUTCDate();
  return `${day === 1 ? "1er" : day} ${month} ${year}`;
}

export function formatEventDate(e: {
  date: Date;
  datePrecision: DatePrecision;
  dateEnd?: Date | null;
}): string {
  const start = formatPoint(e.date, e.datePrecision);
  if (!e.dateEnd) return start;
  const end = formatPoint(e.dateEnd, e.datePrecision);
  return e.datePrecision === "DAY" ? `du ${start} au ${end}` : `de ${start} à ${end}`;
}

/** Dernier jour couvert par la date, à 00:00 UTC. */
function periodEnd(date: Date, precision: DatePrecision): Date {
  const y = date.getUTCFullYear();
  if (precision === "YEAR") return new Date(Date.UTC(y, 11, 31));
  if (precision === "MONTH") return new Date(Date.UTC(y, date.getUTCMonth() + 1, 0));
  return normalizeEventDate(date, "DAY");
}

type DescribableEvent = {
  date: Date;
  datePrecision: DatePrecision;
  dateEnd?: Date | null;
  occurrence: EventOccurrence;
  type: AffairEventType;
};

const UNCONFIRMED_SUFFIX = ", non confirmé à ce jour";

function isUnconfirmed(e: DescribableEvent, today: Date): boolean {
  if (e.occurrence !== "SCHEDULED") return false;
  return periodEnd(e.date, e.datePrecision).getTime() < parisDay(today).getTime();
}

/**
 * Texte de date affiché sur le rail. Une étape annoncée dont la période est passée sans
 * confirmation reste « non confirmée » : ni tenue, ni à venir.
 */
export function describeEventDate(
  e: DescribableEvent,
  today: Date
): { text: string; unconfirmed: boolean } {
  const formatted = formatEventDate(e);
  const preposition = e.datePrecision === "DAY" ? "le" : "en";
  if (e.occurrence === "SCHEDULED") {
    const unconfirmed = isUnconfirmed(e, today);
    const text = `Prévu ${preposition} ${formatted}${unconfirmed ? UNCONFIRMED_SUFFIX : ""}`;
    return { text, unconfirmed };
  }
  if (e.type === "REVELATION") {
    return { text: `Publié ${preposition} ${formatted}`, unconfirmed: false };
  }
  return { text: formatted, unconfirmed: false };
}

export function isUpcoming(e: DescribableEvent, today: Date): boolean {
  return e.occurrence === "SCHEDULED" && !isUnconfirmed(e, today);
}
