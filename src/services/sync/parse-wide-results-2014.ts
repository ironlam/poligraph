/**
 * Parser for the 2014 French municipal election CSV "wide" format.
 *
 * The CSV has 17 fixed columns, then repeating 11-column blocks per list.
 * Differences from 2020: extra "Date" and "Type de scrutin" columns,
 * no panel number in list blocks, combined "Blancs et nuls".
 *
 * Source: data.gouv.fr - Resultats des elections municipales 2014
 */

import { parseIntSafe } from "./csv-download";

import {
  reconstructInseeCode,
  parseFrenchDecimal,
  type ListResult,
  type CommuneResult,
} from "./parse-wide-results";

const FIXED_COLS = 17;
const BLOCK_SIZE = 11;

/** Safe column access. */
function col(cols: string[], index: number): string {
  return cols[index]?.trim() ?? "";
}

/**
 * Parse a single row from the 2014 wide-format CSV.
 *
 * Fixed columns (17):
 *   [0] Date export (skip), [1] Dept code, [2] Type scrutin (skip),
 *   [3] Dept name, [4] Commune code, [5] Commune name,
 *   [6] Inscrits, [7] Abstentions (skip), [8] %Abs (skip),
 *   [9] Votants, [10] %Vot (skip),
 *   [11] Blancs et nuls, [12] %BlNuls/Ins (skip), [13] %BlNuls/Vot (skip),
 *   [14] Exprimes, [15] %Exp/Ins (skip), [16] %Exp/Vot (skip)
 *
 * List blocks (11 cols each starting at 17):
 *   [+0] Nuance, [+1] Sexe, [+2] Nom, [+3] Prenom, [+4] Liste,
 *   [+5] Sieges, [+6] Sieges Secteur, [+7] Sieges CC,
 *   [+8] Voix, [+9] %Voix/Ins, [+10] %Voix/Exp
 */
export function parseWideResultRow2014(cols: string[]): CommuneResult {
  const deptCode = col(cols, 1);
  const deptName = col(cols, 3);
  const communeCode = col(cols, 4);
  const communeName = col(cols, 5);

  const inseeCode = reconstructInseeCode(deptCode, communeCode);

  const registeredVoters = parseIntSafe(col(cols, 6));
  const actualVoters = parseIntSafe(col(cols, 9));
  const participationRate = parseFrenchDecimal(col(cols, 10));
  const blancsEtNuls = parseIntSafe(col(cols, 11));
  const expressedVotes = parseIntSafe(col(cols, 14));

  const lists: ListResult[] = [];
  const remaining = cols.length - FIXED_COLS;
  const blockCount = Math.floor(remaining / BLOCK_SIZE);

  for (let i = 0; i < blockCount; i++) {
    const offset = FIXED_COLS + i * BLOCK_SIZE;
    const nuance = col(cols, offset);
    if (!nuance) break;

    const seatsWonStr = col(cols, offset + 5);
    const seatsSectorStr = col(cols, offset + 6);
    const seatsCCStr = col(cols, offset + 7);

    lists.push({
      panelNumber: i + 1,
      nuanceCode: nuance,
      gender: col(cols, offset + 1),
      lastName: col(cols, offset + 2),
      firstName: col(cols, offset + 3),
      listName: col(cols, offset + 4),
      seatsWon: seatsWonStr ? parseIntSafe(seatsWonStr) : null,
      seatsSector: seatsSectorStr ? parseIntSafe(seatsSectorStr) : null,
      seatsCC: seatsCCStr ? parseIntSafe(seatsCCStr) : null,
      votes: parseIntSafe(col(cols, offset + 8)),
      pctRegistered: parseFrenchDecimal(col(cols, offset + 9)),
      pctExpressed: parseFrenchDecimal(col(cols, offset + 10)),
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
    blankVotes: blancsEtNuls,
    nullVotes: 0,
    expressedVotes,
    lists,
  };
}
