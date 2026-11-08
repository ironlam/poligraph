/**
 * PURE parsing of Assemblée nationale "compte rendu de séance" XML (syseron).
 * No I/O, no DB — fully unit-testable.
 *
 * Key facts learned from the real XML:
 *   - <dateSeance> is a full timestamp YYYYMMDDHHmmss(+ms), NOT just a date. It
 *     carries the séance START time (sitting 1 ≈ 09:00, 2 ≈ 15:00, 3 ≈ 21:13).
 *   - <numSeanceJour> gives the sitting order in the day (Unique / 1 / 2 / 3).
 *   - The body holds the full debate (up to ~1 MB). We DO NOT truncate it here:
 *     an amendment number is often cited well beyond the first 5000 characters.
 *
 * Votes (Scrutin.votingDate) carry no time, so startTime is metadata/ordering,
 * never a join key. The séance↔scrutin scoping is content-based (see
 * scrutin-substance/debate-mapping).
 */

const LEGISLATURE = 17;

import { decodeHtmlEntities, removeTags } from "@/lib/parsing/html-utils";

export const DEBATE_PARSER_VERSION = 3;

export interface DebateParagraph {
  id: string;
  speaker: string | null;
  actorRef: string | null;
  role: string | null;
  article: string | null;
  amendments: string[];
  subAmendments: string[];
  textNumber: string | null;
  budgetPart?: "I" | "II" | null;
  /** The text heading says « rectifié » (e.g. « n° 3291 rectifié »). */
  textRectified?: boolean;
  text: string;
}

export interface ParsedSeance {
  paragraphs: DebateParagraph[];
  seanceRef: string;
  /** UTC midnight of the séance calendar day (matches Scrutin.votingDate). */
  date: Date;
  /** Séance start (wall-clock digits read as UTC, ordering only). Null if absent. */
  startTime: Date | null;
  /** Sitting order in the day from <numSeanceJour>. Null if unknown. */
  seanceOrder: number | null;
  /** Full séance text, NEVER truncated. */
  content: string;
  sourceUrl: string | null;
}

/** Parse an AN <dateSeance> value (YYYYMMDD optionally + HHmmss…) into a day +
 *  start time. Returns null when the date part is missing or invalid. */
export function parseSeanceTimestamp(raw: string): { date: Date; startTime: Date | null } | null {
  const digits = raw.trim();
  const m = digits.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    return null;

  let startTime: Date | null = null;
  if (m[4] !== undefined) {
    if (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59) return null;
    startTime = new Date(Date.UTC(year, month - 1, day, Number(m[4]), Number(m[5]), Number(m[6])));
  }
  return { date, startTime };
}

/** Map <numSeanceJour> ("Unique" / "1" / "2" / "3") to a sitting order. */
export function parseSeanceOrder(numSeanceJour: string | null | undefined): number | null {
  if (!numSeanceJour) return null;
  const v = numSeanceJour.trim().toLowerCase();
  if (v === "unique") return 1;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function stripTags(xml: string): string {
  return decodeHtmlEntities(removeTags(xml.replace(/<br\s*\/?>/g, " ")))
    .replace(/\s+/g, " ")
    .trim();
}

/** Syceron uses both `930` and `(n[[o]] 930)` in bibard. Accept only
 * these explicit forms, never an arbitrary number found in surrounding prose. */
function parseTextNumber(value: string): string | null {
  return /^\d+$/.test(value) ? value : (/^\(n\[\[os?\]\]\s*(\d+)\)$/.exec(value)?.[1] ?? null);
}

/** Extract a full séance record from one compte-rendu XML document. */
export function extractSeanceFromXml(xml: string): ParsedSeance | null {
  const uidMatch = xml.match(/<uid>([^<]+)<\/uid>/);
  const seanceRefMatch = xml.match(/<seanceRef>([^<]+)<\/seanceRef>/);
  const dateMatch = xml.match(/<dateSeance>(\d{8,})/);
  const numSeanceJourMatch = xml.match(/<numSeanceJour>([^<]+)<\/numSeanceJour>/);
  if (!uidMatch || !dateMatch) return null;

  const ts = parseSeanceTimestamp(dateMatch[1]!);
  if (!ts) return null;

  const uid = uidMatch[1]!;
  const seanceRef = seanceRefMatch?.[1] ?? uid;
  const seanceOrder = parseSeanceOrder(numSeanceJourMatch?.[1] ?? null);

  // sommaire=1 also marks real spoken announcements inside <contenu>.
  // Exclude the metadata table of contents by location, never by that attribute.
  const body = xml.match(/<contenu>([\s\S]*?)<\/contenu>/)?.[1] ?? "";
  const paragraphs: DebateParagraph[] = [];
  let textNumber: string | null = null;
  let budgetPart: "I" | "II" | null = null;
  let textRectified = false;
  for (const match of body.matchAll(
    /<point\b([^>]*)>|<paragraphe\b([^>]*)>([\s\S]*?)<\/paragraphe>/g
  )) {
    if (match[1] !== undefined) {
      if (/\bnivpoint=["']1["']/.test(match[1])) {
        budgetPart = null;
        textRectified = /\bvaleur=["'][^"']*rectifi/i.test(match[1]);
        textNumber = match[1].match(/\bvaleur=["'][^"']*?n\[\[os?\]\]\s*(\d+)/)?.[1] ?? null;
      }
      if (/\bnivpoint=["']2["']/.test(match[1])) {
        const heading = stripTags(
          body.slice(match.index!, match.index! + 1500).split("</texte>")[0]!
        ).toLowerCase();
        if (/première partie/.test(heading)) budgetPart = "I";
        else if (/seconde partie|deuxième partie/.test(heading)) budgetPart = "II";
      }
      continue;
    }
    const attrs = match[2]!;
    const block = match[3]!;
    const attr = (name: string) => {
      const value = attrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`))?.[1]?.trim();
      return value || null;
    };
    const rawText = block.match(/<texte\b[^>]*>([\s\S]*?)<\/texte>/)?.[1];
    const text = rawText ? stripTags(rawText) : "";
    if (!text) continue;
    paragraphs.push({
      id: attr("id_syceron") ?? `p${paragraphs.length + 1}`,
      speaker: block.match(/<nom>([^<]+)<\/nom>/)?.[1] ?? null,
      actorRef: attr("id_acteur"),
      role: attr("roledebat"),
      article: attr("art"),
      amendments: (attr("adt") ?? "").split(/[,;\s]+/).filter(Boolean),
      subAmendments: (attr("ssadt") ?? "").split(/[,;\s]+/).filter(Boolean),
      textNumber: attr("bibard") ? parseTextNumber(attr("bibard")!) : textNumber,
      budgetPart,
      ...(textRectified && !attr("bibard") ? { textRectified: true } : {}),
      text,
    });
  }
  const content = paragraphs
    .map((p) => `${p.speaker ? p.speaker + " : " : ""}${p.text}`)
    .join("\n\n");
  if (!content) return null;

  return {
    seanceRef,
    paragraphs,
    date: ts.date,
    startTime: ts.startTime,
    seanceOrder,
    content,
    sourceUrl: `https://www.assemblee-nationale.fr/dyn/${xml.match(/<legislature>(\d+)<\/legislature>/)?.[1] ?? LEGISLATURE}/comptes-rendus/seance/${uid}`,
  };
}
