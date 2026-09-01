import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { factcheckStatsService } from "@/services/factcheckStats";
import { decodeHtmlEntities } from "@/lib/parsing/html-utils";
import { getPublicFactCheckWhere } from "@/lib/api/public-contract";
import type { FactCheckRating } from "@/types";
import { FactCheckRating as FactCheckRatingEnum } from "@/generated/prisma";
import { pickEnumValue } from "@/lib/data/enum-guards";

/** Generic claimant patterns — must match GENERIC_CLAIMANT_PATTERNS in labels.ts */
const GENERIC_CLAIMANT_PATTERNS = [
  "réseaux sociaux",
  "sources multiples",
  "sites internet",
  "publications",
  "utilisateurs",
  "internautes",
  "viral",
  "facebook",
  "twitter",
  "tiktok",
  "whatsapp",
  "telegram",
  "youtube",
  "instagram",
  "chaîne de mails",
  "rumeur",
  "blog",
  "forum",
];

/** Super-category groups for verdict filtering. */
const VERDICT_GROUPS: Record<string, FactCheckRating[]> = {
  faux: ["FALSE", "MOSTLY_FALSE"],
  trompeur: ["MISLEADING", "OUT_OF_CONTEXT", "HALF_TRUE"],
  vrai: ["TRUE", "MOSTLY_TRUE"],
};

function buildVerdictFilter(verdict: string) {
  const group = VERDICT_GROUPS[verdict];
  if (group) {
    return { verdictRating: { in: group } };
  }
  // Whitelist guard: `verdict` arrives raw from the query string. Neither a
  // known group nor a FactCheckRating means no filter, not a Prisma throw.
  const rating = pickEnumValue(verdict, FactCheckRatingEnum);
  return rating ? { verdictRating: rating } : undefined;
}

function buildDirectClaimFilter() {
  return {
    claimant: { not: null },
    NOT: GENERIC_CLAIMANT_PATTERNS.map((pattern) => ({
      claimant: { contains: pattern, mode: "insensitive" as const },
    })),
  };
}

/**
 * Fetch paginated fact-checks with filters.
 * Routes to cached path (bounded params) or uncached (free-text search).
 */
export async function getFactchecks(params: {
  page: number;
  limit: number;
  source?: string;
  verdict?: string;
  politicianSlug?: string;
  search?: string;
  directOnly?: boolean;
}) {
  if (params.search) {
    return queryFactchecks(params);
  }
  return getFactchecksFiltered(
    params.page,
    params.limit,
    params.source ?? "",
    params.verdict ?? "",
    params.politicianSlug ?? "",
    params.directOnly ?? false
  );
}

/** Cached path — bounded params only (no free-text search). */
async function getFactchecksFiltered(
  page: number,
  limit: number,
  source: string,
  verdict: string,
  politicianSlug: string,
  directOnly: boolean
) {
  "use cache";
  cacheTag("factchecks");
  cacheLife("synced");
  return queryFactchecks({
    page,
    limit,
    source: source || undefined,
    verdict: verdict || undefined,
    politicianSlug: politicianSlug || undefined,
    directOnly: directOnly || undefined,
  });
}

/** Uncached query — shared implementation. */
async function queryFactchecks(params: {
  page: number;
  limit: number;
  source?: string;
  verdict?: string;
  politicianSlug?: string;
  search?: string;
  directOnly?: boolean;
}) {
  const { page, limit, source, verdict, politicianSlug, search, directOnly } = params;
  const skip = (page - 1) * limit;

  const where = {
    ...getPublicFactCheckWhere(source),
    ...(verdict && buildVerdictFilter(verdict)),
    ...(politicianSlug && {
      mentions: {
        some: {
          politician: { slug: politicianSlug, publicationStatus: "PUBLISHED" as const },
          ...(directOnly && { isClaimant: true }),
        },
      },
    }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" as const } },
        { claimText: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...(directOnly && !politicianSlug && buildDirectClaimFilter()),
  };

  const [factChecks, total] = await Promise.all([
    db.factCheck.findMany({
      where,
      // Sort by the source's publication date so visitors see the most
      // recently published fact-checks first. createdAt is only a tie-breaker
      // for stable pagination when several share the same publication day.
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      include: {
        mentions: {
          where: { politician: { publicationStatus: "PUBLISHED" } },
          select: {
            isClaimant: true,
            politician: {
              select: { slug: true, fullName: true },
            },
          },
        },
      },
    }),
    db.factCheck.count({ where }),
  ]);

  return {
    factChecks: factChecks.map((fc) => ({
      ...fc,
      title: decodeHtmlEntities(fc.title),
      claimText: decodeHtmlEntities(fc.claimText),
      claimant: fc.claimant ? decodeHtmlEntities(fc.claimant) : fc.claimant,
    })),
    total,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Aggregated page stats (total, by rating, top politicians) — cached.
 */
export async function getFactcheckStats() {
  "use cache";
  cacheTag("factchecks");
  cacheLife("synced");

  return factcheckStatsService.getPageStats();
}

/**
 * Distinct sources with counts — cached.
 */
export async function getFactcheckSources() {
  "use cache";
  cacheTag("factchecks");
  cacheLife("synced");

  const sources = await db.factCheck.groupBy({
    by: ["source"],
    where: getPublicFactCheckWhere(),
    _count: true,
    orderBy: { _count: { source: "desc" } },
  });
  return sources.map((s) => ({ name: s.source, count: s._count }));
}

/**
 * Resolve politician full name from slug (for filter badge display).
 */
export async function getPoliticianNameBySlug(slug: string): Promise<string | null> {
  "use cache";
  cacheTag(`politician:${slug}`, "politicians");
  cacheLife("synced");

  const p = await db.politician.findFirst({
    where: { slug, publicationStatus: "PUBLISHED" },
    select: { fullName: true },
  });
  return p?.fullName || null;
}

/**
 * Get politician context for the filter banner (photo, party, factcheck count).
 */
export async function getPoliticianFactcheckContext(slug: string) {
  "use cache";
  cacheTag("factchecks", "politicians");
  cacheLife("synced");

  const politician = await db.politician.findFirst({
    where: { slug, publicationStatus: "PUBLISHED" },
    select: {
      fullName: true,
      slug: true,
      photoUrl: true,
      currentParty: {
        select: { shortName: true },
      },
      _count: {
        select: {
          factCheckMentions: {
            where: {
              factCheck: getPublicFactCheckWhere(),
            },
          },
        },
      },
    },
  });

  if (!politician) return null;

  return {
    fullName: politician.fullName,
    slug: politician.slug,
    photoUrl: politician.photoUrl,
    party: politician.currentParty?.shortName || null,
    factcheckCount: politician._count.factCheckMentions,
  };
}
