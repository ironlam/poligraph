import { cache } from "react";
import { cacheTag, cacheLife } from "next/cache";
import { Prisma, PoliticalPosition as PoliticalPositionEnum } from "@/generated/prisma";
import { pickEnumValue } from "@/lib/data/enum-guards";
import { db } from "@/lib/db";
import { CONVICTION_BADGE_WHERE } from "@/config/labels";
import { getJudicialMaturity } from "@/config/judicial-maturity";
import type { PoliticalPosition } from "@/types";
import {
  getPublicPartySqlWhere,
  PUBLIC_PARTY_WHERE,
  PUBLIC_POLITICIAN_PUBLICATION_STATUS,
  PUBLIC_POLITICIAN_WHERE,
} from "@/lib/api/public-contract";
import { getPublishedAffairSqlWhere, getPublishedAffairWhere } from "@/lib/affairs/public-filters";

export const getParty = cache(async function getParty(slug: string) {
  "use cache";
  cacheTag(`party:${slug}`, "parties");
  cacheLife("synced");

  const party = await db.party.findFirst({
    where: { slug, ...PUBLIC_PARTY_WHERE },
    include: {
      // Current members
      politicians: {
        where: PUBLIC_POLITICIAN_WHERE,
        orderBy: { fullName: "asc" },
        include: {
          mandates: {
            where: { isCurrent: true },
            take: 1,
          },
          _count: {
            select: {
              affairs: { where: CONVICTION_BADGE_WHERE },
            },
          },
        },
      },
      // Membership history (for people who were members but aren't currently)
      partyMemberships: {
        where: { politician: PUBLIC_POLITICIAN_WHERE },
        include: {
          politician: true,
        },
        orderBy: { startDate: "desc" },
      },
      // Affairs that happened when politician was in this party
      affairsAtTime: {
        where: {
          ...getPublishedAffairWhere(),
          politician: PUBLIC_POLITICIAN_WHERE,
        },
        include: {
          politician: true,
        },
        orderBy: { verdictDate: "desc" },
      },
      // Party evolution
      predecessor: {
        include: {
          _count: { select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } } },
        },
      },
      successors: { where: PUBLIC_PARTY_WHERE },
      // External IDs
      externalIds: true,
      // Press mentions
      pressMentions: {
        orderBy: { article: { publishedAt: "desc" } },
        take: 5,
        include: {
          article: {
            select: {
              id: true,
              title: true,
              url: true,
              feedSource: true,
              publishedAt: true,
            },
          },
        },
      },
    },
  });
  if (!party) return null;
  // Convert Decimal fields for RSC boundary
  return {
    ...party,
    predecessor:
      party.predecessor && party.predecessor._count.politicians > 0
        ? { ...party.predecessor, _count: undefined }
        : null,
    affairsAtTime: party.affairsAtTime.map((a) => ({
      ...a,
      fineAmount: a.fineAmount != null ? Number(a.fineAmount) : null,
    })),
  };
});

export async function getPartyLeadership(partyId: string, partyName: string) {
  "use cache";
  cacheTag(`party-leadership:${partyId}`, "parties");
  cacheLife("synced");

  return db.mandate.findMany({
    where: {
      type: "PRESIDENT_PARTI",
      OR: [
        { partyId },
        { institution: partyName, partyId: null }, // Fallback for non-migrated data
      ],
      politician: PUBLIC_POLITICIAN_WHERE,
    },
    include: {
      politician: true,
    },
    orderBy: { startDate: "desc" },
  });
}

export async function getPartyRoles(partyId: string) {
  "use cache";
  cacheTag(`party-roles:${partyId}`, "parties");
  cacheLife("synced");

  return db.partyMembership.findMany({
    where: {
      partyId,
      role: { not: "MEMBRE" },
      politician: PUBLIC_POLITICIAN_WHERE,
    },
    include: {
      politician: true,
    },
    orderBy: { startDate: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Parties listing page — types & data functions
// ---------------------------------------------------------------------------

export type SortOption = "members" | "alpha" | "alpha-desc";
export type StatusFilter = "actifs" | "historiques" | "";

/** Tier 1: Core query — accepts free-text search (never cached directly). */
async function queryParties(
  search?: string,
  position?: PoliticalPosition,
  status?: StatusFilter,
  sort: SortOption = "members"
) {
  const conditions: Prisma.PartyWhereInput[] = [];

  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { shortName: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  // An out-of-enum ?position= is dropped rather than filtered on: Prisma
  // rejects a bad enum with a validation error, which kills the listing.
  const safePosition = pickEnumValue(position, PoliticalPositionEnum);
  if (safePosition) {
    conditions.push({ politicalPosition: safePosition });
  }

  if (status === "actifs") {
    conditions.push({ dissolvedDate: null });
  } else if (status === "historiques") {
    conditions.push({ dissolvedDate: { not: null } });
  }

  const where = {
    ...PUBLIC_PARTY_WHERE,
    ...(conditions.length > 0 && { AND: conditions }),
  };

  const orderBy =
    sort === "alpha"
      ? [{ name: "asc" as const }]
      : sort === "alpha-desc"
        ? [{ name: "desc" as const }]
        : [{ politicians: { _count: "desc" as const } }, { name: "asc" as const }];

  const parties = await db.party.findMany({
    where,
    include: {
      _count: {
        select: {
          politicians: { where: PUBLIC_POLITICIAN_WHERE },
          partyMemberships: { where: { politician: PUBLIC_POLITICIAN_WHERE } },
        },
      },
      affairsAtTime: {
        where: {
          ...getPublishedAffairWhere(),
          politician: PUBLIC_POLITICIAN_WHERE,
          involvement: { notIn: ["VICTIM", "PLAINTIFF"] },
        },
        select: { id: true, status: true, involvement: true },
      },
      predecessor: {
        select: {
          shortName: true,
          slug: true,
          _count: { select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } } },
        },
      },
    },
    orderBy,
  });

  return parties
    .filter((p) => p.slug)
    .map((party) => {
      const affairs = party.affairsAtTime;
      const directAffairs = affairs.filter(
        (a) => a.involvement === "DIRECT" || a.involvement === "INDIRECT"
      );
      const condamnations = directAffairs.filter(
        (a) => getJudicialMaturity(a.status) === "CONDAMNATION"
      ).length;
      const enCours = directAffairs.filter((a) => {
        const m = getJudicialMaturity(a.status);
        return m === "PROCEDURE_VALIDEE" || m === "ENQUETE";
      }).length;
      const closesSansCondamnation = directAffairs.filter(
        (a) => getJudicialMaturity(a.status) === "CLOSE_SANS_CONDAMNATION"
      ).length;
      const total = directAffairs.length;

      return {
        ...party,
        predecessor:
          party.predecessor && party.predecessor._count.politicians > 0
            ? { shortName: party.predecessor.shortName, slug: party.predecessor.slug }
            : null,
        affairCounts: { condamnations, enCours, closesSansCondamnation, total },
        affairsAtTime: undefined,
      };
    });
}

/** Tier 2: Cached path — bounded params only (no free-text). */
async function getPartiesFiltered(
  position?: PoliticalPosition,
  status?: StatusFilter,
  sort: SortOption = "members"
) {
  "use cache";
  cacheTag("parties");
  cacheLife("synced");
  return queryParties(undefined, position, status, sort);
}

/** Tier 3: Uncached path — free-text search. */
async function searchParties(
  search: string,
  position?: PoliticalPosition,
  status?: StatusFilter,
  sort: SortOption = "members"
) {
  return queryParties(search, position, status, sort);
}

/** Router — decides cached vs uncached. */
export async function getParties(
  search?: string,
  position?: PoliticalPosition,
  status?: StatusFilter,
  sort: SortOption = "members"
) {
  if (search) {
    return searchParties(search, position, status, sort);
  }
  return getPartiesFiltered(position, status, sort);
}

export async function getPartiesStats() {
  "use cache";
  cacheTag("parties");
  cacheLife("synced");

  const [counts] = await db.$queryRaw<
    [{ actifs: bigint; gauche: bigint; centre: bigint; droite: bigint; affaires: bigint }]
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (
        WHERE p."dissolvedDate" IS NULL
          AND ${getPublicPartySqlWhere()}
      ) AS actifs,
      COUNT(*) FILTER (
        WHERE p."politicalPosition" IN ('FAR_LEFT', 'LEFT', 'CENTER_LEFT')
          AND p."dissolvedDate" IS NULL
          AND ${getPublicPartySqlWhere()}
      ) AS gauche,
      COUNT(*) FILTER (
        WHERE p."politicalPosition" IN ('CENTER')
          AND p."dissolvedDate" IS NULL
          AND ${getPublicPartySqlWhere()}
      ) AS centre,
      COUNT(*) FILTER (
        WHERE p."politicalPosition" IN ('CENTER_RIGHT', 'RIGHT', 'FAR_RIGHT')
          AND p."dissolvedDate" IS NULL
          AND ${getPublicPartySqlWhere()}
      ) AS droite,
      COUNT(DISTINCT p.id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM "Affair" a
          WHERE a."partyAtTimeId" = p.id
            AND ${getPublishedAffairSqlWhere()}
            AND EXISTS (
              SELECT 1 FROM "Politician" public_affair_politician
              WHERE public_affair_politician.id = a."politicianId"
                AND public_affair_politician."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}
            )
            AND a.involvement NOT IN ('VICTIM', 'PLAINTIFF')
        )
      ) AS affaires
    FROM "Party" p
    WHERE p.slug IS NOT NULL
      AND ${getPublicPartySqlWhere()}
  `);

  return {
    actifs: Number(counts.actifs),
    gauche: Number(counts.gauche),
    centre: Number(counts.centre),
    droite: Number(counts.droite),
    affaires: Number(counts.affaires),
  };
}
