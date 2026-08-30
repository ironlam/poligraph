/**
 * Parser for the 2020 French municipal election CSV "wide" format.
 *
 * The CSV has 18 fixed columns (commune identification + participation stats),
 * then repeating 12-column blocks per list/candidate.
 *
 * Source: data.gouv.fr — Résultats des élections municipales 2020
 */

import { parseIntSafe } from "./csv-download";

const FIXED_COLS = 18;
const BLOCK_SIZE = 12;

/** DOM-TOM department letter codes → standard INSEE prefix */
const DOMTOM_MAP: Record<string, string> = {
  ZA: "971", // Guadeloupe
  ZB: "972", // Martinique
  ZC: "973", // Guyane
  ZD: "974", // Réunion
  ZM: "976", // Mayotte
  ZN: "988", // Nouvelle-Calédonie
  ZP: "987", // Polynésie française
  ZS: "975", // Saint-Pierre-et-Miquelon
};

export interface ListResult {
  panelNumber: number;
  nuanceCode: string;
  gender: string;
  lastName: string;
  firstName: string;
  listName: string;
  seatsWon: number | null;
  seatsSector: number | null;
  seatsCC: number | null;
  votes: number;
  pctRegistered: number;
  pctExpressed: number;
}

export interface CommuneResult {
  inseeCode: string;
  communeName: string;
  deptCode: string;
  deptName: string;
  registeredVoters: number;
  actualVoters: number;
  participationRate: number;
  blankVotes: number;
  nullVotes: number;
  expressedVotes: number;
  lists: ListResult[];
}

/** Parse a French decimal string (comma separator) to a number. Returns 0 for empty strings. */
export function parseFrenchDecimal(s: string): number {
  if (!s || s.trim() === "") return 0;
  return parseFloat(s.replace(",", "."));
}

/**
 * Reconstruct a 5-character INSEE code from department and commune codes.
 *
 * - Standard departments: zero-padded to 2 digits + commune padded to 3 digits
 * - Corsica (2A, 2B): kept as-is + commune padded to 3 digits
 * - DOM-TOM (ZA, ZB, etc.): mapped to 3-digit prefix + commune padded to 2 digits
 */
export function reconstructInseeCode(deptCode: string, communeCode: string): string {
  const mappedDept = DOMTOM_MAP[deptCode] ?? deptCode;
  const isDomTom = mappedDept.length >= 3;
  const paddedDept = isDomTom
    ? mappedDept
    : /^2[AB]$/i.test(mappedDept)
      ? mappedDept
      : mappedDept.padStart(2, "0");
  // DOM-TOM: 3-digit dept + 2-digit commune = 5 chars
  // Metropolitan: 2-digit dept + 3-digit commune = 5 chars
  const communeWidth = isDomTom ? 2 : 3;
  const paddedCommune = communeCode.padStart(communeWidth, "0").slice(-communeWidth);
  return `${paddedDept}${paddedCommune}`;
}

/** Safe column access — returns trimmed string or empty string for missing indices. */
function col(cols: string[], index: number): string {
  return cols[index]?.trim() ?? "";
}

/**
 * Parse a single row (as an array of string columns) from the wide-format CSV.
 *
 * The first 18 columns are fixed commune/participation data.
 * After that, each list/candidate occupies a 12-column block.
 */
export function parseWideResultRow(cols: string[]): CommuneResult {
  const deptCode = col(cols, 0);
  const deptName = col(cols, 1);
  const communeCode = col(cols, 2);
  const communeName = col(cols, 3);

  const inseeCode = reconstructInseeCode(deptCode, communeCode);

  const registeredVoters = parseIntSafe(col(cols, 4));
  const actualVoters = parseIntSafe(col(cols, 7));
  const participationRate = parseFrenchDecimal(col(cols, 8));
  const blankVotes = parseIntSafe(col(cols, 9));
  const nullVotes = parseIntSafe(col(cols, 12));
  const expressedVotes = parseIntSafe(col(cols, 15));

  const lists: ListResult[] = [];
  const remaining = cols.length - FIXED_COLS;
  const blockCount = Math.floor(remaining / BLOCK_SIZE);

  for (let i = 0; i < blockCount; i++) {
    const offset = FIXED_COLS + i * BLOCK_SIZE;
    const panelNum = col(cols, offset);
    if (!panelNum) break;

    const seatsWonStr = col(cols, offset + 6);
    const seatsSectorStr = col(cols, offset + 7);
    const seatsCCStr = col(cols, offset + 8);

    lists.push({
      panelNumber: parseIntSafe(panelNum),
      nuanceCode: col(cols, offset + 1),
      gender: col(cols, offset + 2),
      lastName: col(cols, offset + 3),
      firstName: col(cols, offset + 4),
      listName: col(cols, offset + 5),
      seatsWon: seatsWonStr ? parseIntSafe(seatsWonStr) : null,
      seatsSector: seatsSectorStr ? parseIntSafe(seatsSectorStr) : null,
      seatsCC: seatsCCStr ? parseIntSafe(seatsCCStr) : null,
      votes: parseIntSafe(col(cols, offset + 9)),
      pctRegistered: parseFrenchDecimal(col(cols, offset + 10)),
      pctExpressed: parseFrenchDecimal(col(cols, offset + 11)),
    });
  }

  return {
    inseeCode,
    communeName,
    deptCode,
    deptName,
    registeredVoters,
    actualVoters,
    participationRate,
    blankVotes,
    nullVotes,
    expressedVotes,
    lists,
  };
}
