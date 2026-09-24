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

export interface ParsedSeance {
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
  if (Number.isNaN(date.getTime())) return null;

  let startTime: Date | null = null;
  if (m[4] !== undefined) {
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
  return (
    xml
      .replace(/<italique>/g, "")
      .replace(/<\/italique>/g, "")
      .replace(/<br\/>/g, " ")
      .replace(/<[^>]+>/g, "")
      // An unterminated `<` survives the strip above. This content goes to the database and into a
      // prompt, where a stray angle bracket is markup nobody wrote.
      .replace(/[<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
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

  // Concatenate every spoken paragraphe. No truncation.
  const texts: string[] = [];
  const paragrapheRegex = /<paragraphe[^>]*roledebat="[^"]*"[^>]*>[\s\S]*?<\/paragraphe>/g;
  let match: RegExpExecArray | null;
  while ((match = paragrapheRegex.exec(xml)) !== null) {
    const block = match[0];
    const nameMatch = block.match(/<nom>([^<]+)<\/nom>/);
    const texteMatch = block.match(/<texte[^>]*>([\s\S]*?)<\/texte>/);
    if (texteMatch) {
      const speaker = nameMatch ? `${nameMatch[1]} : ` : "";
      const text = stripTags(texteMatch[1]!);
      if (text && text.length > 20) texts.push(speaker + text);
    }
  }

  const content = texts.join("\n\n");
  if (!content) return null;

  return {
    seanceRef,
    date: ts.date,
    startTime: ts.startTime,
    seanceOrder,
    content,
    sourceUrl: `https://www.assemblee-nationale.fr/dyn/${LEGISLATURE}/comptes-rendus/seance/${uid}`,
  };
}
