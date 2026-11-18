import { parse } from "csv-parse/sync";
import { MANDAT_BY_LABEL, type ParrainageMandat } from "@/config/parrainages";

/**
 * Parsing of the list of presidential presentations ("parrainages") published by the Conseil
 * constitutionnel on data.gouv.fr. Pure: no network, no database. Every value is kept as
 * published (trimmed, nothing else); the only derived field is `mandat`, read from an explicit
 * table. Anything the table or the date format does not cover is reported, never guessed.
 */

/** Header of the 2022 file, in order. A different header means a different format: we stop. */
export const PARRAINAGES_COLUMNS = [
  "Civilité",
  "Nom",
  "Prénom",
  "Mandat",
  "Circonscription",
  "Département",
  "Candidat",
  "Date de publication",
] as const;

export interface ParrainageRow {
  /** Line number in the file, header on line 1. */
  line: number;
  civility: string;
  lastName: string;
  firstName: string;
  mandateLabel: string;
  mandat: ParrainageMandat | null;
  /** Empty for the mandates the list publishes without one (senators, MEPs...). */
  constituencyLabel: string;
  departmentLabel: string;
  /** As published: "NOM Prénom". */
  candidateName: string;
  /** ISO date (YYYY-MM-DD) of the publication by the Conseil constitutionnel. */
  publishedOn: string;
}

export interface ParrainagesParseResult {
  rows: ParrainageRow[];
  /** Lines with a wrong column count, an empty required value or an unreadable date. */
  rejected: { line: number; reason: string }[];
  /** Mandate labels absent from MANDAT_BY_LABEL, sorted. */
  unknownMandateLabels: string[];
}

/** "07/03/2022" to "2022-03-07". Null for anything that is not a real calendar date. */
export function parsePublicationDate(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null;
}

const REQUIRED = ["Civilité", "Nom", "Prénom", "Mandat", "Département", "Candidat"] as const;

export function parseParrainagesCsv(content: string): ParrainagesParseResult {
  const records: string[][] = parse(content, {
    bom: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true,
    // A line with a stray separator is rejected below with its number, not thrown as a whole file.
    relax_column_count: true,
  });

  const header = records[0] ?? [];
  if (header.join(";") !== PARRAINAGES_COLUMNS.join(";")) {
    throw new Error(`En-tête inattendu dans la liste des parrainages : ${header.join(";")}`);
  }

  const rows: ParrainageRow[] = [];
  const rejected: ParrainagesParseResult["rejected"] = [];
  const unknown = new Set<string>();

  records.slice(1).forEach((values, index) => {
    const line = index + 2;
    if (values.length !== PARRAINAGES_COLUMNS.length) {
      rejected.push({ line, reason: `nombre de colonnes : ${values.length}` });
      return;
    }
    const record = Object.fromEntries(
      PARRAINAGES_COLUMNS.map((column, i) => [column, values[i] ?? ""])
    ) as Record<(typeof PARRAINAGES_COLUMNS)[number], string>;

    const missing = REQUIRED.find((column) => !record[column]);
    if (missing) {
      rejected.push({ line, reason: `colonne vide : ${missing}` });
      return;
    }
    const publishedOn = parsePublicationDate(record["Date de publication"]);
    if (!publishedOn) {
      rejected.push({ line, reason: `date illisible : ${record["Date de publication"]}` });
      return;
    }

    const mandat = MANDAT_BY_LABEL[record.Mandat] ?? null;
    if (!mandat) unknown.add(record.Mandat);

    rows.push({
      line,
      civility: record["Civilité"],
      lastName: record.Nom,
      firstName: record["Prénom"],
      mandateLabel: record.Mandat,
      mandat,
      constituencyLabel: record.Circonscription,
      departmentLabel: record["Département"],
      candidateName: record.Candidat,
      publishedOn,
    });
  });

  return { rows, rejected, unknownMandateLabels: [...unknown].sort() };
}
