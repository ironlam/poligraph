/**
 * Statutory distribution of Senate seats by territorial constituency.
 *
 * A seat exists independently of its current holder. This reference therefore never reads
 * `Mandate`: vacancies, incomplete syncs and group changes cannot alter a constituency's
 * statutory number of seats or its renewal series.
 *
 * Sources in force on 12 August 2026:
 * - Code électoral, tableau n° 5: distribution between series and special constituencies
 *   https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000023260785
 * - Code électoral, tableau n° 6: number of senators representing each department
 *   https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006354327
 *
 * Tableau n° 5 gives department ranges and aggregate totals, not every department's seat
 * count. Tableau n° 6 supplies those individual counts. The special constituencies listed
 * individually in tableau n° 5 complete the reference. Mayotte has two seats under article
 * LO473 and renews them with series 1 under article L474. Its count is included in the 11
 * series-1 overseas seats in tableau n° 5, but neither table states that individual figure.
 */

import type { SenateSeries } from "@/config/senatoriales";

export interface SenateTerritorialConstituency {
  /** INSEE-style code already used by Commune.departmentCode and Mandate.departmentCode. */
  code: string;
  series: SenateSeries;
  seats: number;
}

export type SenateRenewalStatus = "renewed" | "not-renewed" | "unknown";

/**
 * The 107 territorial constituencies. French citizens abroad are deliberately separate:
 * they have no department code and their twelve seats are split between both series.
 */
export const SENATE_TERRITORIAL_CONSTITUENCIES = [
  { code: "01", series: 2, seats: 3 },
  { code: "02", series: 2, seats: 3 },
  { code: "03", series: 2, seats: 2 },
  { code: "04", series: 2, seats: 1 },
  { code: "05", series: 2, seats: 1 },
  { code: "06", series: 2, seats: 5 },
  { code: "07", series: 2, seats: 2 },
  { code: "08", series: 2, seats: 2 },
  { code: "09", series: 2, seats: 1 },
  { code: "10", series: 2, seats: 2 },
  { code: "11", series: 2, seats: 2 },
  { code: "12", series: 2, seats: 2 },
  { code: "13", series: 2, seats: 8 },
  { code: "14", series: 2, seats: 3 },
  { code: "15", series: 2, seats: 2 },
  { code: "16", series: 2, seats: 2 },
  { code: "17", series: 2, seats: 3 },
  { code: "18", series: 2, seats: 2 },
  { code: "19", series: 2, seats: 2 },
  { code: "2A", series: 2, seats: 1 },
  { code: "2B", series: 2, seats: 1 },
  { code: "21", series: 2, seats: 3 },
  { code: "22", series: 2, seats: 3 },
  { code: "23", series: 2, seats: 2 },
  { code: "24", series: 2, seats: 2 },
  { code: "25", series: 2, seats: 3 },
  { code: "26", series: 2, seats: 3 },
  { code: "27", series: 2, seats: 3 },
  { code: "28", series: 2, seats: 3 },
  { code: "29", series: 2, seats: 4 },
  { code: "30", series: 2, seats: 3 },
  { code: "31", series: 2, seats: 5 },
  { code: "32", series: 2, seats: 2 },
  { code: "33", series: 2, seats: 6 },
  { code: "34", series: 2, seats: 4 },
  { code: "35", series: 2, seats: 4 },
  { code: "36", series: 2, seats: 2 },
  { code: "37", series: 1, seats: 3 },
  { code: "38", series: 1, seats: 5 },
  { code: "39", series: 1, seats: 2 },
  { code: "40", series: 1, seats: 2 },
  { code: "41", series: 1, seats: 2 },
  { code: "42", series: 1, seats: 4 },
  { code: "43", series: 1, seats: 2 },
  { code: "44", series: 1, seats: 5 },
  { code: "45", series: 1, seats: 3 },
  { code: "46", series: 1, seats: 2 },
  { code: "47", series: 1, seats: 2 },
  { code: "48", series: 1, seats: 1 },
  { code: "49", series: 1, seats: 4 },
  { code: "50", series: 1, seats: 3 },
  { code: "51", series: 1, seats: 3 },
  { code: "52", series: 1, seats: 2 },
  { code: "53", series: 1, seats: 2 },
  { code: "54", series: 1, seats: 4 },
  { code: "55", series: 1, seats: 2 },
  { code: "56", series: 1, seats: 3 },
  { code: "57", series: 1, seats: 5 },
  { code: "58", series: 1, seats: 2 },
  { code: "59", series: 1, seats: 11 },
  { code: "60", series: 1, seats: 4 },
  { code: "61", series: 1, seats: 2 },
  { code: "62", series: 1, seats: 7 },
  { code: "63", series: 1, seats: 3 },
  { code: "64", series: 1, seats: 3 },
  { code: "65", series: 1, seats: 2 },
  { code: "66", series: 1, seats: 2 },
  { code: "67", series: 2, seats: 5 },
  { code: "68", series: 2, seats: 4 },
  { code: "69", series: 2, seats: 7 },
  { code: "70", series: 2, seats: 2 },
  { code: "71", series: 2, seats: 3 },
  { code: "72", series: 2, seats: 3 },
  { code: "73", series: 2, seats: 2 },
  { code: "74", series: 2, seats: 3 },
  { code: "76", series: 2, seats: 6 },
  { code: "77", series: 1, seats: 6 },
  { code: "79", series: 2, seats: 2 },
  { code: "80", series: 2, seats: 3 },
  { code: "81", series: 2, seats: 2 },
  { code: "82", series: 2, seats: 2 },
  { code: "83", series: 2, seats: 4 },
  { code: "84", series: 2, seats: 3 },
  { code: "85", series: 2, seats: 3 },
  { code: "86", series: 2, seats: 2 },
  { code: "87", series: 2, seats: 2 },
  { code: "88", series: 2, seats: 2 },
  { code: "89", series: 2, seats: 2 },
  { code: "90", series: 2, seats: 1 },
  { code: "91", series: 1, seats: 5 },
  { code: "75", series: 1, seats: 12 },
  { code: "92", series: 1, seats: 7 },
  { code: "93", series: 1, seats: 6 },
  { code: "94", series: 1, seats: 6 },
  { code: "95", series: 1, seats: 5 },
  { code: "78", series: 1, seats: 6 },
  { code: "971", series: 1, seats: 3 },
  { code: "972", series: 1, seats: 2 },
  { code: "973", series: 2, seats: 2 },
  { code: "974", series: 1, seats: 4 },
  { code: "976", series: 1, seats: 2 },
  { code: "975", series: 1, seats: 1 },
  { code: "977", series: 2, seats: 1 },
  { code: "978", series: 2, seats: 1 },
  { code: "986", series: 2, seats: 1 },
  { code: "987", series: 2, seats: 2 },
  { code: "988", series: 1, seats: 2 },
] as const satisfies readonly SenateTerritorialConstituency[];

export const FEHF_SENATE_SEATS = { 1: 6, 2: 6 } as const satisfies Record<SenateSeries, number>;

export const SENATE_STATUTORY_SEATS_BY_SERIES = { 1: 170, 2: 178 } as const satisfies Record<
  SenateSeries,
  number
>;
export const SENATE_STATUTORY_SEATS_TOTAL = 348;

const CONSTITUENCY_BY_CODE = new Map<string, SenateTerritorialConstituency>(
  SENATE_TERRITORIAL_CONSTITUENCIES.map((constituency) => [constituency.code, constituency])
);

/** Undefined means a genuine absence from the statutory reference. */
export function getSenateTerritorialConstituency(
  code: string
): SenateTerritorialConstituency | undefined {
  return CONSTITUENCY_BY_CODE.get(code);
}

/** Renewal status for 2026. Unknown means the legal reference genuinely has no such code. */
export function getSenateRenewal(code: string): SenateRenewalStatus {
  const constituency = getSenateTerritorialConstituency(code);
  if (!constituency) return "unknown";
  return constituency.series === 2 ? "renewed" : "not-renewed";
}

/** Statutory seats renewed in 2026, or null outside series 2 and outside the reference. */
export function getSenateSeatsAtStake(code: string): number | null {
  const constituency = getSenateTerritorialConstituency(code);
  return constituency?.series === 2 ? constituency.seats : null;
}
