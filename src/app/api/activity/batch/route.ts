import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withCache } from "@/lib/cache";
import { withPublicRoute } from "@/lib/api/with-public-route";
import type {
  WatchlistPolitician,
  WatchlistParty,
  ActivityItem,
  ActivityStats,
} from "@/types/activity";

const MAX_SLUGS = 50;
const MAX_PARTY_SLUGS = 20;
const DEFAULT_DAYS = 30;
const MAX_ITEMS_PER_TYPE = 50;

export const POST = withPublicRoute(async (request: NextRequest) => {
  const body = await request.json();
  const slugs: string[] = Array.isArray(body.slugs) ? body.slugs.slice(0, MAX_SLUGS) : [];
  const partySlugs: string[] = Array.isArray(body.partySlugs)
    ? body.partySlugs.slice(0, MAX_PARTY_SLUGS)
    : [];
  const days = Math.min(Math.max(Number(body.days) || DEFAULT_DAYS, 1), 90);

  if (slugs.length === 0 && partySlugs.length === 0) {
    return NextResponse.json({ error: "slugs or partySlugs required" }, { status: 400 });
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  // Resolve slugs to politicians
  const politicians = await db.politician.findMany({
    where: { slug: { in: slugs }, publicationStatus: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      fullName: true,
      photoUrl: true,
      currentParty: { select: { shortName: true, color: true } },
    },
  });

  if (politicians.length === 0 && partySlugs.length === 0) {
    return withCache(
      NextResponse.json({
        activity: [],
        politicians: [],
        parties: [],
        stats: { votesCount: 0, activeAffairsCount: 0 },
      }),
      "daily"
    );
  }

  const infoById = new Map<string, WatchlistPolitician>(
    politicians.map((p) => [
      p.id,
      {
        slug: p.slug,
        fullName: p.fullName,
        photoUrl: p.photoUrl,
        party: p.currentParty?.shortName ?? null,
        partyColor: p.currentParty?.color ?? null,
      },
    ])
  );
  const politicianIds = [...infoById.keys()];

  // 2 parallel queries for politician activity — within pool limits with take caps
  const politicianActivityPromise =
    politicianIds.length > 0
      ? Promise.all([
          db.vote.findMany({
            where: {
              politicianId: { in: politicianIds },
              votingDate: { gte: since },
            },
            select: {
              politicianId: true,
              position: true,
              scrutin: {
                select: { slug: true, title: true, votingDate: true, result: true },
              },
            },
            orderBy: { votingDate: "desc" },
            take: MAX_ITEMS_PER_TYPE,
          }),
          db.affair.findMany({
            where: {
              politicianId: { in: politicianIds },
              publicationStatus: "PUBLISHED",
              createdAt: { gte: since },
            },
            select: {
              politicianId: true,
              slug: true,
              title: true,
              status: true,
              category: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: MAX_ITEMS_PER_TYPE,
          }),
        ])
      : Promise.resolve([[], []] as const);

  // Party resolution — parallel with politician queries
  const partyPromise =
    partySlugs.length > 0
      ? db.party.findMany({
          where: { slug: { in: partySlugs } },
          select: {
            id: true,
            slug: true,
            name: true,
            shortName: true,
            color: true,
            _count: { select: { partyMemberships: { where: { endDate: null } } } },
          },
        })
      : Promise.resolve([]);

  const [politicianActivity, resolvedParties] = await Promise.all([
    politicianActivityPromise,
    partyPromise,
  ]);
  const [votes, affairs] = politicianActivity;

  // Build party info map (filter out parties without a slug)
  const partyInfoMap = new Map<string, WatchlistParty>();
  for (const p of resolvedParties) {
    if (p.slug) {
      partyInfoMap.set(p.id, {
        slug: p.slug,
        name: p.name,
        shortName: p.shortName,
        color: p.color,
        memberCount: p._count.partyMemberships,
      });
    }
  }

  // Generate party-update activity items (only for parties with slugs)
  const partyActivityItems: ActivityItem[] = [];
  for (const party of resolvedParties) {
    const partyInfo = partyInfoMap.get(party.id);
    if (!partyInfo) continue; // skip parties without slug

    const recentVoteCount = await db.vote.count({
      where: {
        politician: { currentPartyId: party.id },
        votingDate: { gte: since },
      },
    });
    if (recentVoteCount > 0) {
      partyActivityItems.push({
        type: "party-update",
        date: new Date().toISOString(),
        politician: null,
        party: partyInfo,
        data: {
          scrutinCount: recentVoteCount,
          message: `${recentVoteCount} vote${recentVoteCount > 1 ? "s" : ""} récent${recentVoteCount > 1 ? "s" : ""} des membres du parti`,
        },
      });
    }
  }

  // Unify into chronological feed
  const voteItems: ActivityItem[] = votes.map((v) => ({
    type: "vote" as const,
    date: v.scrutin.votingDate.toISOString(),
    politician: infoById.get(v.politicianId)!,
    party: null,
    data: {
      position: v.position,
      title: v.scrutin.title,
      slug: v.scrutin.slug,
      result: v.scrutin.result,
    },
  }));
  const affairItems: ActivityItem[] = affairs.map((a) => ({
    type: "affair" as const,
    date: a.createdAt.toISOString(),
    politician: infoById.get(a.politicianId)!,
    party: null,
    data: {
      slug: a.slug,
      title: a.title,
      status: a.status,
      category: a.category,
    },
  }));

  const activity: ActivityItem[] = [...voteItems, ...affairItems, ...partyActivityItems];

  activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Aggregated stats from fetched data
  const stats: ActivityStats = {
    votesCount: voteItems.length,
    activeAffairsCount: affairItems.length,
  };

  return withCache(
    NextResponse.json({
      activity: activity.slice(0, 100),
      politicians: politicians.map((p) => ({
        slug: p.slug,
        fullName: p.fullName,
        photoUrl: p.photoUrl,
        party: p.currentParty?.shortName ?? null,
        partyColor: p.currentParty?.color ?? null,
      })),
      parties: [...partyInfoMap.values()],
      stats,
    }),
    "daily"
  );
});
