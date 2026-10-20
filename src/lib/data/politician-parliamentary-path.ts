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
