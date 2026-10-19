import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import {
  resolveLegislaturePerimeter,
  type LegislatureWindow,
  type MandatePeriod,
  type PerimeterIssue,
} from "@/lib/votes/legislature-perimeter";
import {
  PARTICIPATION_AVAILABLE,
  PARTICIPATION_COMPUTATION_INCOMPLETE,
  roundParticipationRate,
} from "@/lib/votes/participation-publication";
import type { PoliticianVotingStats } from "@/services/voteStats";

export interface AnLegislatureOption {
  legislature: number;
  totalVotes: number;
}

export interface LegislatureVotes {
  legislature: number;
  counts: { total: number; amendments: number; nonAmendments: number };
  stats: PoliticianVotingStats;
  /** Mandate periods the denominator was built from, or why no rate is published. */
  perimeter: { issue: PerimeterIssue | null; periods: MandatePeriod[] };
}

/**
 * First and last scrutin date of every Assemblée nationale legislature present in the
 * database. Sénat rows are excluded on purpose: their `legislature` is a session-year bucket.
 */
export async function getAnLegislatureWindows(): Promise<
  Array<LegislatureWindow & { legislature: number }>
> {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  const rows = await db.scrutin.groupBy({
    by: ["legislature"],
    where: { chamber: "AN" },
    _min: { votingDate: true },
    _max: { votingDate: true },
  });

  return rows
    .flatMap((row) =>
      row._min.votingDate && row._max.votingDate
        ? [{ legislature: row.legislature, start: row._min.votingDate, end: row._max.votingDate }]
        : []
    )
    .sort((a, b) => b.legislature - a.legislature);
}

/**
 * Legislatures in which a politician has at least one recorded Assemblée nationale vote,
 * most recent first. A legislature without imported votes is never offered: its absence from
 * the selector is not a statement about the deputy's career.
 */
export async function getPoliticianAnLegislatures(
  politicianId: string
): Promise<AnLegislatureOption[]> {
  "use cache";
  cacheTag("votes", "politicians");
  cacheLife("synced");

  const windows = await getAnLegislatureWindows();
  const counts = await Promise.all(
    windows.map((w) =>
      db.vote.count({
        where: { politicianId, scrutin: { legislature: w.legislature, chamber: "AN" } },
      })
    )
  );

  return windows
    .map((w, i) => ({ legislature: w.legislature, totalVotes: counts[i] ?? 0 }))
    .filter((option) => option.totalVotes > 0);
}

/**
 * Votes, tab counts and participation of one deputy for one legislature, all read on the
 * same perimeter (`Scrutin.legislature`, Assemblée nationale).
 *
 * Participation is the existing public method (`public-scrutins-v2`): positions expressed
 * (pour, contre, abstention) over the scrutins held while the deputy had a documented mandate.
 * A scrutin without a recorded position is not an absence: the source does not distinguish
 * absence from a gap, so it is reported as "sans position enregistrée" and never as absent.
 * The rate is withheld, with the reason, whenever the mandate perimeter is not established.
 */
export async function getPoliticianLegislatureVotes(
  politicianId: string,
  legislature: number
): Promise<LegislatureVotes> {
  "use cache";
  cacheTag("votes", "politicians");
  cacheLife("synced");

  const scrutinScope = { legislature, chamber: "AN" as const };

  const [grouped, mandates, windows] = await Promise.all([
    db.vote.groupBy({
      by: ["scrutinType", "position"],
      where: { politicianId, scrutin: scrutinScope },
      _count: true,
    }),
    db.mandate.findMany({
      where: { politicianId, type: "DEPUTE" },
      select: {
        id: true,
        politicianId: true,
        type: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
        externalId: true,
      },
    }),
    getAnLegislatureWindows(),
  ]);

  const stats: PoliticianVotingStats = {
    total: 0,
    pour: 0,
    contre: 0,
    abstention: 0,
    nonVotant: 0,
    eligibleScrutins: null,
    scrutinsSansVoteEnregistre: null,
    participationRate: null,
    participationStatus: PARTICIPATION_COMPUTATION_INCOMPLETE,
  };
  const counts = { total: 0, amendments: 0, nonAmendments: 0 };

  for (const row of grouped) {
    const n = row._count;
    counts.total += n;
    if (row.scrutinType === "AMENDEMENT") counts.amendments += n;
    else counts.nonAmendments += n;
    stats.total += n;
    switch (row.position) {
      case "POUR":
        stats.pour += n;
        break;
      case "CONTRE":
        stats.contre += n;
        break;
      case "ABSTENTION":
        stats.abstention += n;
        break;
      case "NON_VOTANT":
        stats.nonVotant += n;
        break;
    }
  }

  const window = windows.find((w) => w.legislature === legislature);
  if (!window) {
    return { legislature, counts, stats, perimeter: { issue: "NO_MANDATE", periods: [] } };
  }

  const resolved = resolveLegislaturePerimeter(mandates, window);
  if (resolved.issue) {
    return { legislature, counts, stats, perimeter: { issue: resolved.issue, periods: [] } };
  }

  const inPeriods = resolved.periods.map((p) => ({ votingDate: { gte: p.start, lte: p.end } }));
  const [eligibleScrutins, votesOutsidePeriods] = await Promise.all([
    db.scrutin.count({ where: { ...scrutinScope, OR: inPeriods } }),
    db.vote.count({
      where: { politicianId, scrutin: scrutinScope, NOT: { OR: inPeriods } },
    }),
  ]);

  // A recorded vote outside every documented period proves the dates are wrong or incomplete.
  if (votesOutsidePeriods > 0) {
    return {
      legislature,
      counts,
      stats,
      perimeter: { issue: "VOTES_OUTSIDE_MANDATE", periods: [] },
    };
  }
  // Documented periods during which no scrutin was held give no denominator.
  if (eligibleScrutins <= 0) {
    return { legislature, counts, stats, perimeter: { issue: "NO_MANDATE", periods: [] } };
  }

  const expressed = stats.pour + stats.contre + stats.abstention;
  stats.eligibleScrutins = eligibleScrutins;
  stats.scrutinsSansVoteEnregistre = Math.max(0, eligibleScrutins - stats.total);
  stats.participationRate = roundParticipationRate(expressed, eligibleScrutins);
  stats.participationStatus = PARTICIPATION_AVAILABLE;

  return { legislature, counts, stats, perimeter: { issue: null, periods: resolved.periods } };
}
