import type { DataSource, MandateType } from "@/generated/prisma";
import type { DataStatusKind } from "@/lib/parlement/data-status";
import {
  resolveLegislaturePerimeter,
  type PerimeterIssue,
} from "@/lib/votes/legislature-perimeter";

/** A deputy mandate as stored, with the fields the parliamentary path needs. */
export interface PathMandate {
  id: string;
  politicianId: string;
  type: MandateType;
  startDate: Date;
  endDate: Date | null;
  isCurrent: boolean;
  constituency: string | null;
  source: DataSource | null;
  lastConfirmedAt: Date | null;
}

export interface PathLegislatureInput {
  number: number;
  /** « 2022-2024 » ou « depuis 2024 ». */
  period: string;
  /** First sitting to end; `end` is null for a legislature in progress. */
  span: { start: Date; end: Date | null };
  /**
   * Recorded Assemblée nationale votes of this person in this legislature, null when none is
   * recorded. `perimeterIssue` says whether the mandate dates agree with those votes.
   */
  votes: { total: number; perimeterIssue: PerimeterIssue | null } | null;
  /** True when individual votes are imported at all for this legislature. */
  votesImported: boolean;
}

/**
 * How far the mandate dates of a row can be trusted. Only `CONSISTENT` is a positive finding:
 * no recorded vote falls outside the documented mandate. Everything else is stated, not hidden.
 */
export type PathDatesReason = "CONSISTENT" | "NOT_CROSS_CHECKED" | PerimeterIssue;

export interface ParliamentaryPathRow {
  legislature: number;
  period: string;
  /** Documented deputy mandates whose dates meet the legislature, oldest first. */
  mandates: PathMandate[];
  votes: { total: number } | null;
  votesImported: boolean;
  datesStatus: { kind: DataStatusKind; reason: PathDatesReason };
}

/**
 * A closed mandate without an end date stands for its start day only: its end is unknown, so it
 * must not stretch over later legislatures.
 */
function meetsSpan(mandate: PathMandate, span: PathLegislatureInput["span"]): boolean {
  const start = mandate.startDate.getTime();
  const end =
    mandate.isCurrent || mandate.endDate === null
      ? mandate.isCurrent
        ? Number.POSITIVE_INFINITY
        : start
      : mandate.endDate.getTime();
  const spanEnd = span.end ? span.end.getTime() : Number.POSITIVE_INFINITY;
  return start <= spanEnd && end >= span.start.getTime();
}

/**
 * One row per legislature in which a deputy mandate or a recorded vote exists, most recent
 * first. Nothing is inferred: a legislature with neither is absent, a mandate is attached only
 * by its own dates, and the group, the party and the current affiliation play no part.
 */
export function buildParliamentaryPath({
  mandates,
  legislatures,
  now,
}: {
  mandates: readonly PathMandate[];
  legislatures: readonly PathLegislatureInput[];
  now: Date;
}): ParliamentaryPathRow[] {
  const deputyMandates = mandates
    .filter((m) => m.type === "DEPUTE")
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const rows: ParliamentaryPathRow[] = [];

  for (const legislature of legislatures) {
    const inSpan = deputyMandates.filter((m) => meetsSpan(m, legislature.span));
    const votes = legislature.votes && legislature.votes.total > 0 ? legislature.votes : null;
    if (inSpan.length === 0 && !votes) continue;

    let reason: PathDatesReason;
    if (votes) {
      // The votes were read against the legislature's own mandate perimeter (see #1160).
      reason = votes.perimeterIssue ?? "CONSISTENT";
    } else {
      // Nothing to cross-check the dates with: only contradictions between mandates can be said.
      const clipped = resolveLegislaturePerimeter(inSpan, {
        start: legislature.span.start,
        end: legislature.span.end ?? now,
      });
      reason = clipped.issue ?? "NOT_CROSS_CHECKED";
    }

    rows.push({
      legislature: legislature.number,
      period: legislature.period,
      mandates: inSpan,
      votes: votes ? { total: votes.total } : null,
      votesImported: legislature.votesImported,
      datesStatus: { kind: reason === "CONSISTENT" ? "complete" : "unverified", reason },
    });
  }

  return rows.sort((a, b) => b.legislature - a.legislature);
}
