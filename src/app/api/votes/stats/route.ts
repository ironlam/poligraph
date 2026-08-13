import { NextRequest, NextResponse } from "next/server";
import { Chamber } from "@/generated/prisma";
import { voteStatsService } from "@/services/voteStats";
import { withCache } from "@/lib/cache";
import { parsePagination } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";

export const GET = withPublicRoute(async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const chamberParam = searchParams.get("chamber");
  if (chamberParam !== null && chamberParam !== "AN" && chamberParam !== "SENAT") {
    return NextResponse.json({ error: "Chambre invalide" }, { status: 400 });
  }
  const chamber = chamberParam as Chamber | null;
  const { limit } = parsePagination(searchParams, { defaultLimit: 20, maxLimit: 100 });

  const stats = await voteStatsService.getVoteStats(chamber || undefined, {
    partyLimit: limit,
    divisiveLimit: limit,
  });

  return withCache(
    NextResponse.json({
      parties: stats.parties,
      divisiveScrutins: stats.divisiveScrutins,
      global: {
        ...stats.global,
        totalVotes:
          stats.global.totalVotesFor +
          stats.global.totalVotesAgainst +
          stats.global.totalVotesAbstain,
      },
    }),
    "stats"
  );
});
