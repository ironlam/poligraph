import type { MaireRNECSV } from "./types";

/**
 * Turning RNE mayor CSV rows into the shape the importer writes.
 *
 * Pure on purpose. `syncRNEMaires` ran parsing, four database phases and the reporting inside one
 * 483-line function, so none of the decisions below could be exercised without a database. They
 * are the part that is easy to get wrong: INSEE code assembly, French dates, and which duplicate
 * of a commune wins.
 */

export interface ParsedMaireRow {
  inseeCode: string;
  /** Set only when the commune exists in our table, because it is a foreign key. */
  communeId: string | null;
  communeLabel: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  civility: string | null;
  gender: string | null;
  birthDate: Date | null;
  deptCode: string;
  mandateStart: Date | null;
  functionStart: Date | null;
}

export interface ParsedMaires {
  /** One row per commune, deduplicated. */
  rows: ParsedMaireRow[];
  /** Every INSEE code seen in the file, including rows that were later deduplicated. */
  seenCommuneIds: Set<string>;
  /** INSEE code to commune label, used to give the identity resolver some context. */
  communeNameByInsee: Map<string, string>;
  /** Rows the file could not describe, reported rather than thrown. */
  errors: string[];
  /** How many rows were dropped as duplicates of another. */
  duplicatesDropped: number;
}

/**
 * Parse an RNE date, in either shape the export has used.
 *
 * The files were published as DD/MM/YYYY and are now published as YYYY-MM-DD:
 * every one of the 34 826 rows in the August 2026 maires export is ISO. Reading
 * only the old shape returns null for all of them, which is worse than failing
 * loudly: birth dates vanish and `mandateStartDate` silently falls back to its
 * May 2020 default, dating a whole cycle of mandates six years early.
 *
 * Built with the local-time constructor on purpose. Birth dates in this base
 * are stored as midnight Paris ("1965-11-26T23:00:00Z" for 27 November), and
 * `new Date("1965-11-27")` would be UTC midnight, one hour off and unequal to
 * every row already written.
 */
export function parseFrenchDate(str: string): Date | null {
  if (!str || str.trim() === "") return null;
  const trimmed = str.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const [day, month, year] = iso
    ? [Number(iso[3]), Number(iso[2]), Number(iso[1])]
    : trimmed.split("/").map(Number);

  if (!day || !month || !year) return null;

  // Midi UTC, pas minuit local : construire la date avec le fuseau du process
  // la fait glisser d'un jour selon l'endroit où le script tourne. À midi UTC,
  // le jour calendaire à Paris est celui qu'on a lu, partout.
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (isNaN(date.getTime()) || year < 1900 || year > 2100) return null;

  return date;
}

/**
 * Same calendar day in Paris, whatever timezone the process runs in.
 *
 * Comparing with the process-local getters passes on a developer machine set to
 * Europe/Paris and fails on CI and on Vercel, which run UTC: a birth date stored
 * as Paris midnight sits at "1965-11-26T23:00:00Z", whose UTC day is the 26th
 * while the freshly parsed value lands on the 27th. The mismatch would recreate
 * as a duplicate the very person it was written to recognise.
 *
 * The legal day is the French one, so it is the one both sides are read in.
 */
const PARIS_DAY = new Intl.DateTimeFormat("fr-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function parisCalendarDay(date: Date): string {
  return PARIS_DAY.format(date);
}

export function sameCalendarDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return parisCalendarDay(a) === parisCalendarDay(b);
}

/**
 * Build a 5-character INSEE code from department code + commune code.
 *
 * Unlike the candidatures CSV (which has a separate 3-digit commune suffix), the RNE maires CSV's
 * "Code de la commune" is already the FULL 5-digit INSEE code (e.g., "01001"). We detect this and
 * use it directly. Some communes carry a code from a neighbouring department (communes nouvelles
 * merged across a boundary), so the department prefix cannot be checked.
 */
export function buildInseeCode(deptCode: string, communeCode: string): string {
  const trimmedDept = deptCode.trim();
  const trimmedCommune = communeCode.trim();

  if (trimmedCommune.length === 5) return trimmedCommune;

  const code =
    trimmedDept.length === 3
      ? trimmedDept + trimmedCommune.padStart(2, "0")
      : trimmedDept + trimmedCommune.padStart(3, "0");

  if (code.length !== 5) {
    console.warn(
      `buildInseeCode: unexpected length ${code.length} for dept="${deptCode}" commune="${communeCode}" -> "${code}"`
    );
  }

  return code;
}

/** Normalize a name to title case, handling compound names with spaces and hyphens. */
export function normalizeName(name: string): string {
  return name
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * @param records rows straight from the CSV parser
 * @param knownCommuneIds INSEE codes present in our `Commune` table, for foreign-key validation
 */
export function parseMaireRows(
  records: MaireRNECSV[],
  knownCommuneIds: ReadonlySet<string>
): ParsedMaires {
  const rows: ParsedMaireRow[] = [];
  const seenCommuneIds = new Set<string>();
  const communeNameByInsee = new Map<string, string>();
  const errors: string[] = [];

  records.forEach((row, index) => {
    const nom = row["Nom de l'élu"];
    const prenom = row["Prénom de l'élu"];
    const codeCommune = row["Code de la commune"];
    const deptCode = row["Code du département"];

    if (!nom || !prenom) {
      errors.push(`Row ${index + 1}: missing name`);
      return;
    }
    if (!deptCode || !codeCommune) {
      errors.push(`Row ${index + 1}: missing department or commune code for ${prenom} ${nom}`);
      return;
    }

    const inseeCode = buildInseeCode(deptCode, codeCommune);
    seenCommuneIds.add(inseeCode);

    const communeLabel = row["Libellé de la commune"]?.trim() || null;
    if (communeLabel) communeNameByInsee.set(inseeCode, communeLabel);

    const firstName = normalizeName(prenom);
    const lastName = normalizeName(nom);
    const genderCode = row["Code sexe"];
    const gender = genderCode === "M" ? "M" : genderCode === "F" ? "F" : null;

    rows.push({
      inseeCode,
      communeId: knownCommuneIds.has(inseeCode) ? inseeCode : null,
      communeLabel,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      civility: gender === "F" ? "Mme" : gender === "M" ? "M." : null,
      gender,
      birthDate: parseFrenchDate(row["Date de naissance"]),
      deptCode,
      mandateStart: parseFrenchDate(row["Date de début du mandat"]),
      functionStart: parseFrenchDate(row["Date de début de la fonction"]),
    });
  });

  // One mayor per commune. The file can repeat a commune; the last occurrence is the current one.
  const deduped = new Map<string, ParsedMaireRow>();
  for (const row of rows) deduped.set(row.inseeCode, row);

  return {
    rows: [...deduped.values()],
    seenCommuneIds,
    communeNameByInsee,
    errors,
    duplicatesDropped: rows.length - deduped.size,
  };
}

/** The mandate labels shown on the site, derived from the commune label when we have one. */
export function mandateLabels(row: ParsedMaireRow): { title: string; constituency: string } {
  return row.communeLabel
    ? {
        title: `Maire de ${row.communeLabel}`,
        constituency: `${row.communeLabel} (${row.inseeCode})`,
      }
    : { title: `Maire (${row.inseeCode})`, constituency: row.inseeCode };
}

/**
 * Fallback start date for a mandate the file does not date: 18 May 2020, the day the mayors
 * elected in the 2020 municipal elections took office.
 */
export const DEFAULT_MANDATE_START = new Date(2020, 4, 18);

export function mandateStartDate(row: ParsedMaireRow): Date {
  return row.functionStart || row.mandateStart || DEFAULT_MANDATE_START;
}
