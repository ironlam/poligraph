/**
 * What the hub says about the people elected on 27 September 2026.
 *
 * Pure: the data layer reads the candidacies written by
 * `scripts/import-senatoriales-results.ts` and hands them here.
 *
 * A person not linked to a record is never counted as a newcomer: calling someone new
 * means we established they were not an outgoing senator, and an unresolved identity
 * establishes nothing. The hub shows those two counts as missing while any remains.
 */

export interface ElectedRow {
  candidateName: string;
  constituencyCode: string;
  constituencyName: string;
  partyLabel: string | null;
  /** Non-null only for someone elected at the second round. */
  round2Votes: number | null;
  politicianId: string | null;
  politicianSlug: string | null;
  gender: string | null;
  updatedAt: Date;
}

export interface ElectedSenator {
  constituencyCode: string;
  constituencyName: string;
  name: string;
  nuanceLabel: string | null;
  round: 1 | 2;
  politicianId: string | null;
  politicianSlug: string | null;
  status: "reelected" | "newcomer" | "unresolved";
  gender: "F" | "M" | null;
}

export const RENEWED_CONSTITUENCIES = 64;

export interface SenatorialesResultsSummary {
  elected: ElectedSenator[];
  proclaimedConstituencies: number;
  totalConstituencies: typeof RENEWED_CONSTITUENCIES;
  seatsFilled: number;
  reelected: number;
  newcomers: number;
  unresolved: number;
  womenShare: number | null;
  lastImportedAt: Date | null;
}

export function summariseResults(
  rows: ElectedRow[],
  outgoingPoliticianIds: Set<string>
): SenatorialesResultsSummary {
  const elected: ElectedSenator[] = rows
    .map((r) => ({
      constituencyCode: r.constituencyCode,
      constituencyName: r.constituencyName,
      name: r.candidateName,
      nuanceLabel: r.partyLabel,
      round: r.round2Votes !== null ? (2 as const) : (1 as const),
      politicianId: r.politicianId,
      politicianSlug: r.politicianId ? r.politicianSlug : null,
      status:
        r.politicianId === null
          ? ("unresolved" as const)
          : outgoingPoliticianIds.has(r.politicianId)
            ? ("reelected" as const)
            : ("newcomer" as const),
      gender: r.gender === "F" || r.gender === "M" ? (r.gender as "F" | "M") : null,
    }))
    .sort(
      (a, b) =>
        (a.constituencyCode < b.constituencyCode
          ? -1
          : a.constituencyCode > b.constituencyCode
            ? 1
            : 0) || a.name.localeCompare(b.name, "fr")
    );

  const count = (status: ElectedSenator["status"]) =>
    elected.filter((e) => e.status === status).length;
  const allGendered = elected.length > 0 && elected.every((e) => e.gender !== null);

  return {
    elected,
    proclaimedConstituencies: new Set(elected.map((e) => e.constituencyCode)).size,
    totalConstituencies: RENEWED_CONSTITUENCIES,
    seatsFilled: elected.length,
    reelected: count("reelected"),
    newcomers: count("newcomer"),
    unresolved: count("unresolved"),
    womenShare: allGendered
      ? elected.filter((e) => e.gender === "F").length / elected.length
      : null,
    lastImportedAt: rows.length
      ? new Date(Math.max(...rows.map((r) => r.updatedAt.getTime())))
      : null,
  };
}
