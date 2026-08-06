/**
 * Overlap detection between party affiliations.
 *
 * Overlaps are legitimate (a main party plus a micro-party) as often as they are typos
 * (a wrong year), so this never blocks a write: it reports, and the admin reads.
 *
 * Callers pass the projected post-write state. In a succession the affiliation about to
 * be closed must be supplied with its future endDate, otherwise every party change
 * would report a conflict and the banner would become noise.
 */

export interface AffiliationInterval {
  partyId: string;
  partyShortName: string;
  startDate: Date | null;
  endDate: Date | null;
}

export interface OverlapWarning {
  type: "OVERLAP";
  partyId: string;
  partyShortName: string;
  startDate: string | null;
  endDate: string | null;
}

/**
 * Intervals are half-open: [startDate, endDate[. A null startDate reads as -Infinity, a
 * null endDate as +Infinity. Half-open is what makes a succession seam (previous end ==
 * new start) come out clean.
 */
function overlaps(a: AffiliationInterval, b: AffiliationInterval): boolean {
  const aStart = a.startDate?.getTime() ?? -Infinity;
  const aEnd = a.endDate?.getTime() ?? Infinity;
  const bStart = b.startDate?.getTime() ?? -Infinity;
  const bEnd = b.endDate?.getTime() ?? Infinity;

  return aStart < bEnd && bStart < aEnd;
}

export function findOverlaps(
  candidate: AffiliationInterval,
  existing: AffiliationInterval[]
): OverlapWarning[] {
  return existing
    .filter((other) => overlaps(candidate, other))
    .map((other) => ({
      type: "OVERLAP" as const,
      partyId: other.partyId,
      partyShortName: other.partyShortName,
      startDate: other.startDate?.toISOString() ?? null,
      endDate: other.endDate?.toISOString() ?? null,
    }));
}
