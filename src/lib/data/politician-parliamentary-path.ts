import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import {
  LEGISLATURE_NUMBERS,
  datasetLevel,
  getLegislatureView,
  legislatureSpan,
} from "@/lib/parlement/legislature-labels";
import {
  buildParliamentaryPath,
  type ParliamentaryPathRow,
  type PathLegislatureInput,
} from "@/lib/politicians/parliamentary-path";
import {
  getPoliticianAnLegislatures,
  getPoliticianLegislatureVotes,
} from "@/services/politician-legislature-votes";

/**
 * Parliamentary path of one person: the Assemblée nationale legislatures in which a deputy
 * mandate or a recorded vote exists. Read live (not from the profile snapshot) so the snapshot
 * and its write points stay untouched; the result is cached per person and follows the votes
 * and politicians tags.
 *
 * Nothing is inferred: no group, no party, no continuity between legislatures.
 */
export async function getPoliticianParliamentaryPath(
  politicianId: string
): Promise<ParliamentaryPathRow[]> {
  "use cache";
  cacheTag("votes", "politicians");
  cacheLife("synced");

  const [mandates, options] = await Promise.all([
    db.mandate.findMany({
      where: { politicianId, type: "DEPUTE" },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        politicianId: true,
        type: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
        constituency: true,
        source: true,
        lastConfirmedAt: true,
      },
    }),
    getPoliticianAnLegislatures(politicianId),
  ]);

  const votesByLegislature = new Map(
    await Promise.all(
      options.map(
        async (option) =>
          [
            option.legislature,
            await getPoliticianLegislatureVotes(politicianId, option.legislature),
          ] as const
      )
    )
  );

  const legislatures: PathLegislatureInput[] = [];
  for (const number of LEGISLATURE_NUMBERS) {
    const view = getLegislatureView(number);
    const span = view ? legislatureSpan(view.facts) : null;
    if (!view || !span) continue;
    const votes = votesByLegislature.get(number);
    legislatures.push({
      number,
      period: view.period,
      span: { start: new Date(span.start), end: span.end ? new Date(span.end) : null },
      votes: votes ? { total: votes.counts.total, perimeterIssue: votes.perimeter.issue } : null,
      votesImported: datasetLevel(view.coverage, "individual-votes") !== "absent",
    });
  }

  return buildParliamentaryPath({ mandates, legislatures, now: new Date() });
}

/**
 * Ids of the people with at least one recorded Assemblée nationale vote. Read once for the whole
 * site and cached, so a profile never pays a query of its own to find out whether it qualifies.
 * Meant for the few people whose votes exist without a deputy mandate on file (historical
 * legislatures with an incomplete mandate list): neither the mandates nor the profile snapshot
 * says anything about them, since the snapshot only computes vote statistics for a CURRENT
 * parliamentary mandate. Counted on the votes themselves, never on a mandate.
 *
 * The `some` filter is a single semi-join (about 100 ms); a `groupBy` over the votes takes more
 * than a second.
 */
export async function getPoliticianIdsWithAnVotes(): Promise<string[]> {
  "use cache";
  cacheTag("votes", "politicians");
  cacheLife("synced");

  const rows = await db.politician.findMany({
    where: { votes: { some: { chamber: "AN" } } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * Entry point of the profile: the parliamentary path of a person, or nothing when there is no
 * trace of one. A deputy mandate on the profile qualifies, and so do recorded Assemblée nationale
 * votes without any mandate (a person whose only mandate on file is local still gets the row of
 * the legislature where the votes were cast, flagged "mandat non enregistré"). Everyone else
 * costs no extra read.
 */
export async function loadParliamentaryPath({
  politicianId,
  mandates,
}: {
  politicianId: string;
  mandates: ReadonlyArray<{ type: string }>;
}): Promise<ParliamentaryPathRow[]> {
  const hasDeputyMandate = mandates.some((mandate) => mandate.type === "DEPUTE");
  if (!hasDeputyMandate) {
    const withVotes = await getPoliticianIdsWithAnVotes();
    if (!withVotes.includes(politicianId)) return [];
  }
  return getPoliticianParliamentaryPath(politicianId);
}
