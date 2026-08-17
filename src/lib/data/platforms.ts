import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { PUBLIC_PARTY_WHERE } from "@/lib/api/public-contract";
import type { ThematicAxis, PublicationStatus } from "@/generated/prisma";

// --- Single platform by party slug + election ---

export const getPartyPlatform = cache(async function getPartyPlatform(
  partySlug: string,
  electionId?: string
) {
  "use cache";
  cacheTag(`party:${partySlug}`, "platforms");
  cacheLife("synced");

  const where: Record<string, unknown> = {
    party: { slug: partySlug, ...PUBLIC_PARTY_WHERE },
    publicationStatus: "PUBLISHED",
  };
  if (electionId) where.electionId = electionId;

  const platform = await db.platform.findFirst({
    where,
    include: {
      proposals: {
        orderBy: { axis: "asc" },
      },
      party: {
        select: {
          id: true,
          slug: true,
          name: true,
          shortName: true,
          color: true,
          logoUrl: true,
        },
      },
      election: {
        select: { id: true, slug: true, title: true, type: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return platform;
});

// --- All platforms for a given election ---

export async function getPlatformsByElection(electionId: string) {
  "use cache";
  cacheTag("platforms");
  cacheLife("synced");

  return db.platform.findMany({
    where: {
      electionId,
      publicationStatus: "PUBLISHED",
      party: PUBLIC_PARTY_WHERE,
    },
    include: {
      proposals: true,
      party: {
        select: {
          id: true,
          slug: true,
          name: true,
          shortName: true,
          color: true,
          logoUrl: true,
        },
      },
    },
    orderBy: { party: { name: "asc" } },
  });
}

// --- All published platforms (for hub page) ---

async function queryPlatforms(status?: PublicationStatus) {
  return db.platform.findMany({
    where: {
      publicationStatus: status || "PUBLISHED",
      party: PUBLIC_PARTY_WHERE,
    },
    include: {
      party: {
        select: { slug: true, name: true, shortName: true, color: true, logoUrl: true },
      },
      election: {
        select: { slug: true, title: true, type: true, round1Date: true },
      },
      _count: { select: { proposals: true } },
    },
    orderBy: { election: { round1Date: "desc" } },
  });
}

export async function getPlatformsListing() {
  "use cache";
  cacheTag("platforms");
  cacheLife("synced");
  return queryPlatforms();
}

/**
 * Returns the latest published platform for each party.
 * Used by the hub page to show current positions (not election-grouped).
 */
export async function getLatestPlatformsPerParty() {
  "use cache";
  cacheTag("platforms");
  cacheLife("synced");

  // Get all published platforms with party info
  const allPlatforms = await db.platform.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      partyId: { not: null },
      party: PUBLIC_PARTY_WHERE,
    },
    include: {
      party: {
        select: {
          slug: true,
          name: true,
          shortName: true,
          color: true,
          logoUrl: true,
        },
      },
      election: {
        select: { slug: true, title: true, type: true },
      },
      proposals: {
        select: { axis: true, position: true },
      },
      _count: { select: { proposals: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Keep only the latest platform per party (first occurrence since sorted by createdAt desc)
  const seen = new Set<string>();
  const latest = allPlatforms.filter((p) => {
    if (!p.partyId || seen.has(p.partyId)) return false;
    seen.add(p.partyId);
    return true;
  });

  // Sort alphabetically by party name
  return latest.sort((a, b) => (a.party?.name ?? "").localeCompare(b.party?.name ?? "", "fr"));
}

// --- Proposals for matching (quiz) ---

export async function getPartyPositionsForMatching(electionId: string) {
  "use cache";
  cacheTag("platforms");
  cacheLife("synced");

  const platforms = await db.platform.findMany({
    where: {
      electionId,
      publicationStatus: "PUBLISHED",
      party: PUBLIC_PARTY_WHERE,
    },
    include: {
      proposals: {
        // verifiedBy is a String? - use { not: null } for scalar fields
        where: { verifiedBy: { not: null } },
        select: { axis: true, position: true },
      },
      party: {
        select: {
          slug: true,
          name: true,
          shortName: true,
          color: true,
          logoUrl: true,
        },
      },
    },
  });

  return platforms.map((p) => ({
    party: p.party!,
    positions: Object.fromEntries(p.proposals.map((pr) => [pr.axis, pr.position])) as Partial<
      Record<ThematicAxis, number>
    >,
  }));
}

// --- Quiz questions ---

export async function getQuizQuestions(scope?: "COMMON" | "NATIONAL" | "MUNICIPAL") {
  "use cache";
  cacheTag("quiz-questions");
  cacheLife("synced");

  return db.quizQuestion.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      ...(scope ? { scope } : {}),
    },
    orderBy: [{ scope: "asc" }, { order: "asc" }],
  });
}
