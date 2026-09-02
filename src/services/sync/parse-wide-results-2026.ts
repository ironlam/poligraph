/**
 * Parser for the 2026 French municipal election CSV "wide" format.
 *
 * The CSV has 18 fixed columns (commune identification + participation stats),
 * then repeating 13-column blocks per list/candidate.
 *
 * Key differences from the 2020 format:
 *   - Block size: 13 (vs 12) — added "Sexe candidat"
 *   - Column order within blocks: nom, prénom, sexe, nuance, abrégé, liste complète
 *   - Code commune: full INSEE code directly (no reconstruction needed)
 *   - Encoding: UTF-8 with semicolon delimiter and quoted fields
 *   - Explicit "Elu" column per list
 *
 * Source: data.gouv.fr — Résultats des élections municipales 2026 (premier tour)
 */

import { parseIntSafe } from "./csv-download";

const FIXED_COLS = 18;
const BLOCK_SIZE = 13;

export interface ListResult2026 {
  panelNumber: number;
  lastName: string;
  firstName: string;
  gender: string;
  nuanceCode: string;
  listShortName: string;
  listName: string;
  votes: number;
  pctRegistered: number;
  pctExpressed: number;
  isElected: boolean;
  seatsCM: number | null;
  seatsCC: number | null;
}

export interface CommuneResult2026 {
  inseeCode: string;
  communeName: string;
  deptCode: string;
  deptName: string;
  registeredVoters: number;
  actualVoters: number;
  participationRate: number;
  abstentions: number;
  blankVotes: number;
  nullVotes: number;
  expressedVotes: number;
  lists: ListResult2026[];
}

/** Parse a French percentage string: "55,08%" → 55.08, "100,00%" → 100 */
export function parseFrenchPct(s: string): number {
  if (!s || s.trim() === "") return 0;
  return parseFloat(s.replace("%", "").replace(",", ".").trim()) || 0;
}

/** Strip surrounding quotes from a CSV field. */
function unquote(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Safe column access — returns unquoted, trimmed string or empty string. */
function col(cols: string[], index: number): string {
  return unquote(cols[index] ?? "");
}

/**
 * Split a CSV line by semicolons, respecting quoted fields.
 * Handles escaped quotes ("") inside quoted fields.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ";") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Parse a single row from the 2026 wide-format CSV.
 *
 * Fixed columns (0-17):
 *   0: Code département, 1: Libellé département,
 *   2: Code commune (INSEE), 3: Libellé commune,
 *   4: Inscrits, 5: Votants, 6: % Votants,
 *   7: Abstentions, 8: % Abstentions,
 *   9: Exprimés, 10: % Exprimés/inscrits, 11: % Exprimés/votants,
 *   12: Blancs, 13: % Blancs/inscrits, 14: % Blancs/votants,
 *   15: Nuls, 16: % Nuls/inscrits, 17: % Nuls/votants
 *
 * Repeating 13-column blocks per list:
 *   +0: Numéro de panneau, +1: Nom candidat, +2: Prénom candidat,
 *   +3: Sexe candidat, +4: Nuance liste,
 *   +5: Libellé abrégé de liste, +6: Libellé de liste,
 *   +7: Voix, +8: % Voix/inscrits, +9: % Voix/exprimés,
 *   +10: Elu, +11: Sièges au CM, +12: Sièges au CC
 */
export function parseWideResultRow2026(cols: string[]): CommuneResult2026 {
  const deptCode = col(cols, 0);
  const deptName = col(cols, 1);
  const inseeCode = col(cols, 2);
  const communeName = col(cols, 3);

  const registeredVoters = parseIntSafe(col(cols, 4));
  const actualVoters = parseIntSafe(col(cols, 5));
  const participationRate = parseFrenchPct(col(cols, 6));
  const abstentions = parseIntSafe(col(cols, 7));
  const expressedVotes = parseIntSafe(col(cols, 9));
  const blankVotes = parseIntSafe(col(cols, 12));
  const nullVotes = parseIntSafe(col(cols, 15));

  const lists: ListResult2026[] = [];
  const remaining = cols.length - FIXED_COLS;
  const blockCount = Math.floor(remaining / BLOCK_SIZE);

  for (let i = 0; i < blockCount; i++) {
    const offset = FIXED_COLS + i * BLOCK_SIZE;
    const panelNum = col(cols, offset);
    if (!panelNum) break;

    const seatsCMStr = col(cols, offset + 11);
    const seatsCCStr = col(cols, offset + 12);
    const eluField = col(cols, offset + 10).toLowerCase();
    const pctExpressed = parseFrenchPct(col(cols, offset + 9));
    const seatsCM = seatsCMStr ? parseIntSafe(seatsCMStr) : null;

    // The "Elu" column is empty in the 2026 CSV (never populated by the Ministry).
    // Infer elected status: a list wins at T1 with absolute majority (>50% expressed).
    const isElected = eluField !== "" && eluField !== "non" ? true : pctExpressed > 50;

    lists.push({
      panelNumber: parseIntSafe(panelNum),
      lastName: col(cols, offset + 1),
      firstName: col(cols, offset + 2),
      gender: col(cols, offset + 3),
      nuanceCode: col(cols, offset + 4),
      listShortName: col(cols, offset + 5),
      listName: col(cols, offset + 6),
      votes: parseIntSafe(col(cols, offset + 7)),
      pctRegistered: parseFrenchPct(col(cols, offset + 8)),
      pctExpressed,
      isElected,
      seatsCM,
      seatsCC: seatsCCStr ? parseIntSafe(seatsCCStr) : null,
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
    abstentions,
    blankVotes,
    nullVotes,
    expressedVotes,
    lists,
  };
}
