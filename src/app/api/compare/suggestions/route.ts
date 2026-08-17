import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withCache } from "@/lib/cache";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { CATEGORY_MANDATE_TYPES } from "@/types/compare";
import type { CompareCategory } from "@/types/compare";
import type { PoliticalPosition } from "@/types";
import { PUBLIC_PARTY_WHERE, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";

const POSITION_ORDER: PoliticalPosition[] = [
  "FAR_LEFT",
  "LEFT",
  "CENTER_LEFT",
  "CENTER",
  "CENTER_RIGHT",
  "RIGHT",
  "FAR_RIGHT",
];

function oppositionDistance(a: PoliticalPosition | null, b: PoliticalPosition | null): number {
  if (!a || !b) return 0;
  const idxA = POSITION_ORDER.indexOf(a);
  const idxB = POSITION_ORDER.indexOf(b);
  if (idxA === -1 || idxB === -1) return 0;
  return Math.abs(idxA - idxB);
}

const POLITICIAN_FALLBACKS = [
  {
    leftSlug: "jean-luc-melenchon",
    leftName: "Jean-Luc Mélenchon",
    rightSlug: "marine-le-pen",
    rightName: "Marine Le Pen",
  },
  {
    leftSlug: "jordan-bardella",
    leftName: "Jordan Bardella",
    rightSlug: "mathilde-panot",
    rightName: "Mathilde Panot",
  },
  {
    leftSlug: "emmanuel-macron",
    leftName: "Emmanuel Macron",
    rightSlug: "jean-luc-melenchon",
    rightName: "Jean-Luc Mélenchon",
  },
];

/**
 * @openapi
 * /api/compare/suggestions:
 *   get:
 *     summary: Suggestions de comparaisons populaires
 *     tags: [Comparaison]
 *     parameters:
 *       - name: cat
 *         in: query
 *         schema:
 *           type: string
 *           enum: [deputes, senateurs, partis, groupes, ministres]
 *     responses:
 *       200:
 *         description: Paires de politiciens, partis ou groupes à comparer
 */
export const GET = withPublicRoute(async (request: NextRequest) => {
  const cat = (request.nextUrl.searchParams.get("cat") || "deputes") as CompareCategory;

  switch (cat) {
    case "partis":
      return getPartySuggestions();
    case "groupes":
      return getGroupSuggestions();
    case "deputes":
    case "senateurs":
    case "ministres":
      return getPoliticianSuggestions(cat);
    default:
      return getPoliticianSuggestions("deputes");
  }
});

async function getPoliticianSuggestions(cat: CompareCategory) {
  const mandateTypes = CATEGORY_MANDATE_TYPES[cat];

  try {
    const top = await db.politician.findMany({
      where: {
        publicationStatus: "PUBLISHED",
        prominenceScore: { gte: 150 },
        ...(mandateTypes
          ? { mandates: { some: { isCurrent: true, type: { in: mandateTypes as never[] } } } }
          : {}),
      },
      select: {
        slug: true,
        fullName: true,
        currentPartyId: true,
        prominenceScore: true,
        currentParty: {
          select: { politicalPosition: true },
        },
      },
      orderBy: { prominenceScore: "desc" },
      take: 30,
    });

    type Pair = {
      leftSlug: string;
      leftName: string;
      rightSlug: string;
      rightName: string;
      score: number;
    };
    const candidates: Pair[] = [];

    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const a = top[i];
        const b = top[j];
        if (a!.currentPartyId === b!.currentPartyId) continue;

        const distance = oppositionDistance(
          a!.currentParty?.politicalPosition as PoliticalPosition | null,
          b!.currentParty?.politicalPosition as PoliticalPosition | null
        );
        const score = distance * 100 + (a!.prominenceScore || 0) + (b!.prominenceScore || 0);
        candidates.push({
          leftSlug: a!.slug,
          leftName: a!.fullName,
          rightSlug: b!.slug,
          rightName: b!.fullName,
          score,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const pairs: Pair[] = [];
    const used = new Set<string>();

    for (const c of candidates) {
      if (pairs.length >= 6) break;
      if (used.has(c.leftSlug) || used.has(c.rightSlug)) continue;
      pairs.push(c);
      used.add(c.leftSlug);
      used.add(c.rightSlug);
    }

    if (pairs.length === 0) return withCache(NextResponse.json(POLITICIAN_FALLBACKS), "static");

    return withCache(
      NextResponse.json(
        pairs.map(({ leftSlug, leftName, rightSlug, rightName }) => ({
          leftSlug,
          leftName,
          rightSlug,
          rightName,
        }))
      ),
      "static"
    );
  } catch {
    return withCache(NextResponse.json(POLITICIAN_FALLBACKS), "static");
  }
}

async function getPartySuggestions() {
  try {
    const parties = await db.party.findMany({
      where: {
        ...PUBLIC_PARTY_WHERE,
        slug: { not: null },
        dissolvedDate: null,
        politicians: {
          some: { ...PUBLIC_POLITICIAN_WHERE, mandates: { some: { isCurrent: true } } },
        },
      },
      select: {
        slug: true,
        name: true,
        shortName: true,
        politicalPosition: true,
        _count: { select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } } },
      },
      orderBy: { politicians: { _count: "desc" } },
      take: 15,
    });

    type Pair = {
      leftSlug: string;
      leftName: string;
      rightSlug: string;
      rightName: string;
      score: number;
    };
    const candidates: Pair[] = [];

    for (let i = 0; i < parties.length; i++) {
      for (let j = i + 1; j < parties.length; j++) {
        const a = parties[i];
        const b = parties[j];
        const distance = oppositionDistance(
          a!.politicalPosition as PoliticalPosition | null,
          b!.politicalPosition as PoliticalPosition | null
        );
        const score = distance * 100 + a!._count.politicians + b!._count.politicians;
        candidates.push({
          leftSlug: a!.slug as string,
          leftName: a!.shortName || a!.name,
          rightSlug: b!.slug as string,
          rightName: b!.shortName || b!.name,
          score,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const pairs: Pair[] = [];
    const used = new Set<string>();

    for (const c of candidates) {
      if (pairs.length >= 4) break;
      if (used.has(c.leftSlug) || used.has(c.rightSlug)) continue;
      pairs.push(c);
      used.add(c.leftSlug);
      used.add(c.rightSlug);
    }

    if (pairs.length === 0) return withCache(NextResponse.json([]), "static");

    return withCache(
      NextResponse.json(
        pairs.map(({ leftSlug, leftName, rightSlug, rightName }) => ({
          leftSlug,
          leftName,
          rightSlug,
          rightName,
        }))
      ),
      "static"
    );
  } catch {
    return withCache(NextResponse.json([]), "static");
  }
}

async function getGroupSuggestions() {
  try {
    const groups = await db.parliamentaryGroup.findMany({
      where: { mandates: { some: { mandate: { isCurrent: true } } } },
      select: {
        id: true,
        code: true,
        name: true,
        shortName: true,
        politicalPosition: true,
        _count: { select: { mandates: { where: { mandate: { isCurrent: true } } } } },
      },
      orderBy: { name: "asc" },
      take: 30,
    });

    type Pair = {
      leftSlug: string;
      leftName: string;
      rightSlug: string;
      rightName: string;
      score: number;
    };
    const candidates: Pair[] = [];

    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i]!;
        const b = groups[j]!;
        const distance = oppositionDistance(
          a.politicalPosition as PoliticalPosition | null,
          b.politicalPosition as PoliticalPosition | null
        );
        const score = distance * 100 + a._count.mandates + b._count.mandates;
        candidates.push({
          leftSlug: a.id,
          leftName: a.shortName || a.code,
          rightSlug: b.id,
          rightName: b.shortName || b.code,
          score,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const pairs: Pair[] = [];
    const used = new Set<string>();

    for (const c of candidates) {
      if (pairs.length >= 4) break;
      if (used.has(c.leftSlug) || used.has(c.rightSlug)) continue;
      pairs.push(c);
      used.add(c.leftSlug);
      used.add(c.rightSlug);
    }

    if (pairs.length === 0) return withCache(NextResponse.json([]), "static");

    return withCache(
      NextResponse.json(
        pairs.map(({ leftSlug, leftName, rightSlug, rightName }) => ({
          leftSlug,
          leftName,
          rightSlug,
          rightName,
        }))
      ),
      "static"
    );
  } catch {
    return withCache(NextResponse.json([]), "static");
  }
}
