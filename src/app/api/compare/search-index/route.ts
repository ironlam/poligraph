import { NextResponse } from "next/server";
import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { PUBLIC_PARTY_WHERE, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";

/**
 * Lightweight search index for client-side autocomplete in the compare page.
 * Returns all published politicians and active parties with minimal fields.
 */

async function getSearchIndex() {
  "use cache";
  cacheTag("politicians", "parties", "groups");
  cacheLife("synced");

  const [politicians, parties, groups] = await Promise.all([
    db.politician.findMany({
      where: PUBLIC_POLITICIAN_WHERE,
      select: {
        slug: true,
        fullName: true,
        photoUrl: true,
        currentParty: {
          select: {
            shortName: true,
            color: true,
          },
        },
        mandates: {
          where: { isCurrent: true },
          select: {
            type: true,
            parliamentaryData: {
              select: { parliamentaryGroupId: true },
            },
          },
          orderBy: { startDate: "desc" },
          take: 1,
        },
      },
      orderBy: [{ prominenceScore: "desc" }, { lastName: "asc" }],
    }),
    db.party.findMany({
      where: {
        ...PUBLIC_PARTY_WHERE,
        dissolvedDate: null,
      },
      select: {
        slug: true,
        name: true,
        shortName: true,
        color: true,
        logoUrl: true,
        _count: {
          select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } },
        },
      },
      orderBy: [{ name: "asc" }],
    }),
    db.parliamentaryGroup.findMany({
      where: {
        mandates: { some: { mandate: { isCurrent: true } } },
      },
      select: {
        id: true,
        code: true,
        name: true,
        shortName: true,
        color: true,
        chamber: true,
        _count: { select: { mandates: { where: { mandate: { isCurrent: true } } } } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Map politicians to a flat shape
  const politicianIndex = politicians.map((p) => ({
    slug: p.slug,
    fullName: p.fullName,
    photoUrl: p.photoUrl,
    partyShortName: p.currentParty?.shortName ?? null,
    partyColor: p.currentParty?.color ?? null,
    mandateType: p.mandates[0]?.type ?? null,
    parliamentaryGroupId: p.mandates[0]?.parliamentaryData?.parliamentaryGroupId ?? null,
  }));

  // Map parties to a flat shape, sorted by member count desc then name asc
  const partyIndex = parties
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      shortName: p.shortName,
      color: p.color,
      logoUrl: p.logoUrl,
      memberCount: p._count.politicians,
    }))
    .sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name));

  // Map groups to a flat shape
  const groupIndex = groups.map((g) => ({
    id: g.id,
    code: g.code,
    name: g.name,
    shortName: g.shortName,
    color: g.color,
    chamber: g.chamber,
    memberCount: g._count.mandates,
  }));

  return { politicians: politicianIndex, parties: partyIndex, groups: groupIndex };
}

export const GET = withPublicRoute(async () => {
  const data = await getSearchIndex();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
    },
  });
});
