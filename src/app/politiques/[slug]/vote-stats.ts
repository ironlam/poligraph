import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import {
  buildPoliticianParliamentaryCard,
  getPoliticianDissidence,
  getPoliticianVotingStats,
  voteStatsService,
} from "@/services/voteStats";

/**
 * One boundary, four reads in flight at most: the pool holds four connections (@/config/database)
 * and a render wider than that queues behind itself (POLIGRAPH-2X). The card reuses these stats
 * rather than computing them again, and its dissidence query is cached here with them.
 *
 * Moved out of `page.tsx` when the tab bodies went behind their own Suspense boundary: the profile
 * body is what needs it now, and the page no longer reads it at all.
 */
export async function getProfileVoteStats(
  politicianId: string,
  mandateType: "DEPUTE" | "SENATEUR"
) {
  "use cache";
  cacheTag("votes", "politicians");
  cacheLife("synced");

  const [stats, recentVotes, themeDistribution, dissidence] = await Promise.all([
    getPoliticianVotingStats(politicianId, mandateType),
    db.vote.findMany({
      where: { politicianId },
      include: {
        scrutin: {
          select: {
            id: true,
            // Slug drives the link: /parlement/votes/<cuid> only 308s to the
            // slug URL, so linking by id made every "Derniers votes" row an
            // internal redirect hop for crawlers.
            slug: true,
            title: true,
            votingDate: true,
            result: true,
            // Plan 6: public policy title (shown only when APPROVED + valid).
            policyTitle: {
              select: {
                status: true,
                policyTitle: true,
                policySubtitle: true,
                officialSourceUrl: true,
                proceduralLabel: true,
              },
            },
          },
        },
      },
      orderBy: { votingDate: "desc" },
      take: 5,
    }),
    voteStatsService.getPoliticianThemeDistribution(politicianId),
    getPoliticianDissidence(politicianId),
  ]);

  return {
    voteData: { stats, recentVotes, themeDistribution },
    parliamentaryCard: buildPoliticianParliamentaryCard(mandateType, stats, dissidence),
  };
}
