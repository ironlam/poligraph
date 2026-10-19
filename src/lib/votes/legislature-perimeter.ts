import {
  findOverlappingParliamentaryMandates,
  type MandateInterval,
} from "@/lib/mandates/overlaps";

/** First and last scrutin dates recorded for one Assemblée nationale legislature. */
export interface LegislatureWindow {
  start: Date;
  end: Date;
}

/** Closed interval of days during which a deputy held a documented mandate. */
export interface MandatePeriod {
  start: Date;
  end: Date;
}

/**
 * Why a participation rate cannot be published for a legislature. A rate is only worth
 * showing when the mandate perimeter is established: a wrong denominator misleads more
 * than an explicit gap.
 */
export type PerimeterIssue = "NO_MANDATE" | "OVERLAPPING_MANDATES" | "VOTES_OUTSIDE_MANDATE";

export type LegislaturePerimeter =
  | { issue: null; periods: MandatePeriod[] }
  | { issue: Exclude<PerimeterIssue, "VOTES_OUTSIDE_MANDATE">; periods: [] };

/**
 * Keep the parts of a deputy's mandates that fall inside the legislature, and refuse the
 * perimeter when it cannot be trusted: no documented mandate, or two mandates that
 * contradict each other inside this legislature. Mandates of other legislatures are
 * ignored, even when they overlap each other.
 */
export function resolveLegislaturePerimeter(
  mandates: readonly MandateInterval[],
  window: LegislatureWindow
): LegislaturePerimeter {
  const clipped: MandateInterval[] = [];

  for (const mandate of mandates) {
    if (mandate.type !== "DEPUTE") continue;
    const start = Math.max(new Date(mandate.startDate).getTime(), window.start.getTime());
    // A current mandate is open-ended whatever its endDate says (same rule as the profile).
    const declaredEnd =
      mandate.isCurrent || mandate.endDate === null
        ? Number.POSITIVE_INFINITY
        : new Date(mandate.endDate).getTime();
    const end = Math.min(declaredEnd, window.end.getTime());
    if (Number.isNaN(start) || start > end) continue;
    clipped.push({
      ...mandate,
      startDate: new Date(start),
      endDate: new Date(end),
      isCurrent: false,
    });
  }

  if (clipped.length === 0) return { issue: "NO_MANDATE", periods: [] };
  if (findOverlappingParliamentaryMandates(clipped).length > 0) {
    return { issue: "OVERLAPPING_MANDATES", periods: [] };
  }

  return {
    issue: null,
    periods: clipped.map((m) => ({ start: new Date(m.startDate), end: new Date(m.endDate!) })),
  };
}

/**
 * Pick the legislature to display. The raw URL value is never used as is: it must be an
 * integer the deputy actually has votes in, otherwise the most recent one applies.
 */
export function resolveLegislatureSelection(
  raw: string | string[] | undefined,
  available: readonly number[]
): number | null {
  if (available.length === 0) return null;
  const mostRecent = Math.max(...available);
  if (typeof raw !== "string" || !/^[0-9]{1,3}$/.test(raw)) return mostRecent;
  const requested = Number(raw);
  return available.includes(requested) ? requested : mostRecent;
}
