/**
 * Presidency of parliamentary groups, as each chamber publishes it in open data.
 *
 * Pure functions: the two parsers read the official files, `currentPresidencies` says who presides
 * today and since when. Nothing is inferred from a name: a person is an official identifier
 * (acteur PA... at the Assemblée, matricule at the Sénat), a group is an official identifier too
 * (organe PO..., Sénat group code).
 */

/** Deputies in office, their active mandates and organs. Published by the Assemblée nationale. */
export const AN_GROUP_PRESIDENCIES_SOURCE_URL =
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/deputes_actifs_mandats_actifs_organes/AMO10_deputes_actifs_mandats_actifs_organes.json.zip";

/** History of group memberships and functions. Published by the Sénat. */
export const SENATE_GROUP_PRESIDENCIES_SOURCE_URL =
  "https://data.senat.fr/data/senateurs/ODSEN_HISTOGROUPES.csv";

/** One function period, exactly as the source states it. */
export interface GroupPresidencyPeriod {
  /** The chamber's identifier of the period: mandate uid (PM...) or "Id fonction occupée". */
  externalId: string;
  /** Acteur uid (PA...) at the Assemblée, matricule at the Sénat. */
  personRef: string;
  /** Organe uid (PO...) at the Assemblée, group code at the Sénat. */
  groupRef: string;
  startDate: Date;
  /** Null while the person is in office. */
  endDate: Date | null;
}

export interface GroupPresidencyParseResult {
  periods: GroupPresidencyPeriod[];
  /** Presidency rows the parser could not read. Each one may hide a president. */
  invalid: string[];
}

const PRESIDENT = "Président";
const AN_GROUP_ORGAN_TYPE = "GP";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed;
}

/**
 * Reads the leading calendar day of a source date ("2024-07-19", "2026-10-05 00:00:00.0").
 * Absent or empty: null. Present but impossible: "invalid", never bent into another day.
 */
function parseDay(value: unknown): Date | null | "invalid" {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return "invalid";
  const text = value.trim();
  if (text === "") return null;
  const day = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|[ T])/)?.[1];
  if (!day) return "invalid";
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) return "invalid";
  return date;
}

/**
 * Reads one acteur file of the AMO10 archive and keeps its mandates of president of a
 * parliamentary group (`typeOrgane: "GP"`, `infosQualite.codeQualite: "Président"`).
 */
export function parseAnGroupPresidencies(raw: unknown): GroupPresidencyParseResult {
  const result: GroupPresidencyParseResult = { periods: [], invalid: [] };
  const acteur = asRecord(asRecord(raw)?.acteur);
  if (!acteur) return result;

  const uid = acteur.uid;
  const personRef = nonEmptyString(asRecord(uid)?.["#text"] ?? uid);
  const mandats = asRecord(acteur.mandats)?.mandat;
  const list = Array.isArray(mandats) ? mandats : [mandats];

  for (const item of list) {
    const mandat = asRecord(item);
    if (!mandat || mandat.typeOrgane !== AN_GROUP_ORGAN_TYPE) continue;
    if (asRecord(mandat.infosQualite)?.codeQualite !== PRESIDENT) continue;

    const externalId = nonEmptyString(mandat.uid);
    const groupRef = nonEmptyString(asRecord(mandat.organes)?.organeRef);
    const startDate = parseDay(mandat.dateDebut);
    const endDate = parseDay(mandat.dateFin);
    if (
      !personRef ||
      !externalId ||
      !groupRef ||
      startDate === null ||
      startDate === "invalid" ||
      endDate === "invalid"
    ) {
      result.invalid.push(`${personRef ?? "acteur inconnu"} / ${externalId ?? "mandat sans uid"}`);
      continue;
    }
    result.periods.push({ externalId, personRef, groupRef, startDate, endDate });
  }
  return result;
}

/** Splits one CSV line with quoted fields (a doubled quote is a literal quote). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

const SENATE_COLUMNS = {
  matricule: "Matricule",
  functionId: "Id fonction occupée",
  groupCode: "Code du groupe politique",
  functionName: "Nom court fonction",
  start: "Date de début de la fonction",
  end: "Date de fin de la fonction",
} as const;

/**
 * Reads ODSEN_HISTOGROUPES (already decoded) and keeps the rows whose function is exactly
 * "Président": a "Président délégué" or a "Vice-Président" does not preside the group.
 *
 * The lines starting with `%` are the SQL query the Sénat prints above the data; columns are
 * found by their header, so a reordered export still parses and a renamed one throws.
 *
 * Old periods often carry no start date. One that has ended is left out, since a period needs a
 * start; one still open without a start is reported, because it hides a sitting president.
 */
export function parseSenateGroupPresidencies(csv: string): GroupPresidencyParseResult {
  const result: GroupPresidencyParseResult = { periods: [], invalid: [] };
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "" && !line.startsWith("%"));
  const header = parseCsvLine(lines[0] ?? "").map((name) => name.trim());

  const index = {} as Record<keyof typeof SENATE_COLUMNS, number>;
  for (const [key, name] of Object.entries(SENATE_COLUMNS)) {
    const position = header.indexOf(name);
    if (position === -1) throw new Error(`ODSEN_HISTOGROUPES : colonne absente « ${name} »`);
    index[key as keyof typeof SENATE_COLUMNS] = position;
  }

  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    if (fields[index.functionName]?.trim() !== PRESIDENT) continue;

    const personRef = nonEmptyString(fields[index.matricule]);
    const functionId = nonEmptyString(fields[index.functionId]);
    const groupRef = nonEmptyString(fields[index.groupCode]);
    const startDate = parseDay(fields[index.start]);
    const endDate = parseDay(fields[index.end]);
    if (startDate === null && endDate !== null && endDate !== "invalid") continue;
    if (
      !personRef ||
      !functionId ||
      !groupRef ||
      startDate === null ||
      startDate === "invalid" ||
      endDate === "invalid"
    ) {
      result.invalid.push(`${personRef ?? "matricule absent"} / ${functionId ?? "sans id"}`);
      continue;
    }
    result.periods.push({ externalId: functionId, personRef, groupRef, startDate, endDate });
  }
  return result;
}

/**
 * Longest gap between two periods of the same person that still counts as one presidency.
 * The Sénat closes every function at a renewal (30 September) and re-opens it once the group has
 * re-elected its president, a few days later: the source shows gaps of two to five days.
 */
export const PRESIDENCY_CONTINUITY_MAX_GAP_DAYS = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

interface TenurePeriod {
  politicianId: string;
  startDate: Date;
  endDate: Date | null;
}

/**
 * Who presides a group today, and since when, from every period known for that group.
 *
 * "Since" is the start of the uninterrupted presidency: a person re-elected at a renewal has
 * presided since their first election, not since the latest formality. The same rule applies to
 * both chambers; at the Assemblée a group lives within one legislature, so there is nothing to
 * chain across terms. Several open periods are all returned (a co-presidency is not ours to
 * arbitrate), oldest first.
 */
export function currentPresidencies<T extends TenurePeriod>(
  periods: readonly T[],
  today: Date
): Array<{ period: T; since: Date }> {
  const inOffice = periods.filter(
    (period) => period.startDate <= today && (period.endDate === null || period.endDate > today)
  );

  return inOffice
    .map((period) => {
      const earlier = periods
        .filter((other) => other.politicianId === period.politicianId && other.endDate !== null)
        .sort((a, b) => b.endDate!.getTime() - a.endDate!.getTime());
      let since = period.startDate;
      for (const previous of earlier) {
        const gapDays = (since.getTime() - previous.endDate!.getTime()) / DAY_MS;
        if (gapDays < 0) continue;
        if (gapDays > PRESIDENCY_CONTINUITY_MAX_GAP_DAYS) break;
        if (previous.startDate < since) since = previous.startDate;
      }
      return { period, since };
    })
    .sort((a, b) => a.since.getTime() - b.since.getTime());
}
