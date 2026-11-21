import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import {
  Prisma,
  type AffairCategory,
  type AffairStatus,
  type Involvement,
} from "@/generated/prisma";
import {
  PUBLIC_POLITICIAN_WHERE,
  PUBLIC_POLITICIAN_PUBLICATION_STATUS,
} from "@/lib/api/public-contract";
import { getPublishedAffairSqlWhere, getPublishedAffairWhere } from "@/lib/affairs/public-filters";
import { PUBLIC_TRACKED_PRESIDENTIAL_CANDIDACY_WHERE } from "@/lib/data/presidential-candidacy-policy";
import type { PartyDisplayRef } from "@/lib/affairs/party-display";
import {
  DEFAULT_PRESIDENTIAL_AFFAIRS_SORT,
  type PresidentialAffairsSort,
} from "@/lib/presidentielle/affaires-listing";

export const AFFAIRS_PAGE_SIZE = 20;

export type PresidentialAffair = {
  id: string;
  slug: string | null;
  title: string;
  description: string;
  status: AffairStatus;
  involvement: Involvement;
  involvementNote: string | null;
  category: AffairCategory;
  verdictDate: Date | null;
  startDate: Date | null;
  factsDate: Date | null;
  sentence: string | null;
  fineAmount: number | null;
  _count: { sources: number };
  politician: {
    slug: string;
    fullName: string;
    currentParty: PartyDisplayRef | null;
  };
  partyAtTime: PartyDisplayRef | null;
  candidates: Array<{
    name: string;
    slug: string;
    status: string | null;
    sourceUrl: string | null;
    sourceLabel: string | null;
  }>;
};

export type PresidentialAffairsCandidateFacet = {
  slug: string;
  fullName: string;
  count: number;
};

export type PresidentialAffairsQuery = {
  page?: number;
  /** Politician slug. Ignored unless it names a facet, so the cache key stays bounded. */
  candidat?: string;
  tri?: PresidentialAffairsSort;
};

export type PresidentialAffairsPageData = {
  affairs: PresidentialAffair[];
  total: number;
  candidates: PresidentialAffairsCandidateFacet[];
  /** The candidate filter actually applied, null when absent or unknown. */
  candidat: string | null;
  tri: PresidentialAffairsSort;
};

// Every order ends on the affair id so pagination never repeats or skips a row on ties.
const ORDER_BY: Record<PresidentialAffairsSort, Prisma.Sql> = {
  recentes: Prisma.sql`COALESCE(a."startDate", a."factsDate", a."createdAt") DESC, a."id" DESC`,
  anciennes: Prisma.sql`COALESCE(a."startDate", a."factsDate", a."createdAt") ASC, a."id" ASC`,
  candidat: Prisma.sql`p."lastName" ASC, p."firstName" ASC, p."id" ASC,
    COALESCE(a."startDate", a."factsDate", a."createdAt") DESC, a."id" DESC`,
};

// The published-affair predicate stays inline in each statement: the attribution guard checks that
// every raw read of "Affair" carries it at the call site.
function trackedCandidateSqlWhere(electionId: string): Prisma.Sql {
  return Prisma.sql`p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}
      AND EXISTS (
        SELECT 1
        FROM "Candidacy" c
        WHERE c."politicianId" = p."id"
          AND c."electionId" = ${electionId}
          AND c."status" IS NOT NULL
          AND c."sourceUrl" IS NOT NULL
          AND c."sourceLabel" IS NOT NULL
      )`;
}

/**
 * Public judicial affairs attached to sourced presidential candidacies.
 * The result is deliberately bounded: the page is an SEO entry point, not an unpaginated export.
 */
export async function getPresidentialAffairs(
  electionSlug: string,
  query: PresidentialAffairsQuery = {}
): Promise<PresidentialAffairsPageData> {
  const tri = query.tri ?? DEFAULT_PRESIDENTIAL_AFFAIRS_SORT;
  const election = await db.election.findUnique({
    where: { slug: electionSlug },
    select: { id: true },
  });

  if (!election) return { affairs: [], total: 0, candidates: [], candidat: null, tri };
  const page = query.page && Number.isSafeInteger(query.page) && query.page > 0 ? query.page : 1;
  const facets = await getPresidentialAffairCandidatesCached(election.id);
  const selected = facets.find((facet) => facet.slug === query.candidat) ?? null;
  // Grouping one person's affairs by person is a no-op: fall back to the default order.
  const effectiveTri = selected && tri === "candidat" ? DEFAULT_PRESIDENTIAL_AFFAIRS_SORT : tri;
  const list = await getPresidentialAffairsCached(
    election.id,
    page,
    selected?.id ?? null,
    effectiveTri
  );

  return {
    ...list,
    candidates: facets.map(({ slug, fullName, count }) => ({ slug, fullName, count })),
    candidat: selected?.slug ?? null,
    tri: effectiveTri,
  };
}

async function getPresidentialAffairCandidatesCached(
  electionId: string
): Promise<Array<PresidentialAffairsCandidateFacet & { id: string }>> {
  "use cache";
  cacheTag("affairs", `election-candidacies:${electionId}`);
  cacheLife("synced");

  const rows = await db.$queryRaw<
    Array<{ id: string; slug: string; fullName: string; count: number }>
  >(Prisma.sql`
    SELECT p."id", p."slug", p."fullName", COUNT(a."id")::int AS "count"
    FROM "Affair" a
    INNER JOIN "Politician" p ON p."id" = a."politicianId"
    WHERE ${getPublishedAffairSqlWhere("a")}
      AND ${trackedCandidateSqlWhere(electionId)}
    GROUP BY p."id", p."slug", p."fullName", p."lastName", p."firstName"
    ORDER BY p."lastName" ASC, p."firstName" ASC, p."id" ASC
  `);
  return rows.map((row) => ({ ...row, count: Number(row.count) }));
}

async function getPresidentialAffairsCached(
  electionId: string,
  page: number,
  politicianId: string | null,
  tri: PresidentialAffairsSort
): Promise<Pick<PresidentialAffairsPageData, "affairs" | "total">> {
  "use cache";
  cacheTag("affairs", `election-candidacies:${electionId}`);
  cacheLife("synced");

  const where = {
    ...getPublishedAffairWhere(),
    ...(politicianId ? { politicianId } : {}),
    politician: {
      ...PUBLIC_POLITICIAN_WHERE,
      candidacies: {
        some: {
          ...PUBLIC_TRACKED_PRESIDENTIAL_CANDIDACY_WHERE,
          electionId,
        },
      },
    },
  };

  // Prisma cannot express COALESCE in orderBy. Fetching only the ordered IDs
  // keeps the public query bounded while preserving the canonical affair chronology.
  const orderedIds = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT a."id"
    FROM "Affair" a
    INNER JOIN "Politician" p ON p."id" = a."politicianId"
    WHERE ${getPublishedAffairSqlWhere("a")}
      AND ${trackedCandidateSqlWhere(electionId)}
      ${politicianId ? Prisma.sql`AND p."id" = ${politicianId}` : Prisma.empty}
    ORDER BY ${ORDER_BY[tri]}
    LIMIT ${AFFAIRS_PAGE_SIZE}
    OFFSET ${(page - 1) * AFFAIRS_PAGE_SIZE}
  `);
  const ids = orderedIds.map(({ id }) => id);

  const [rows, total] = await Promise.all([
    db.affair.findMany({
      where: { ...where, id: { in: ids } },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        status: true,
        involvement: true,
        involvementNote: true,
        category: true,
        verdictDate: true,
        startDate: true,
        factsDate: true,
        sentence: true,
        fineAmount: true,
        sources: { select: { id: true }, take: 1 },
        _count: { select: { sources: true } },
        partyAtTime: {
          select: { id: true, slug: true, shortName: true, name: true, color: true },
        },
        politician: {
          select: {
            slug: true,
            fullName: true,
            currentParty: {
              select: { id: true, slug: true, shortName: true, name: true, color: true },
            },
            candidacies: {
              where: {
                ...PUBLIC_TRACKED_PRESIDENTIAL_CANDIDACY_WHERE,
                electionId,
              },
              select: {
                candidateName: true,
                status: true,
                sourceUrl: true,
                sourceLabel: true,
              },
            },
          },
        },
      },
    }),
    db.affair.count({ where }),
  ]);

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return {
    total,
    affairs: ids.flatMap((id) => {
      const row = rowsById.get(id);
      if (!row) return [];
      return [
        {
          ...row,
          fineAmount: row.fineAmount ? Number(row.fineAmount) : null,
          _count: row._count,
          partyAtTime: row.partyAtTime,
          candidates: row.politician.candidacies.map((candidacy) => ({
            name: candidacy.candidateName,
            slug: row.politician.slug,
            status: candidacy.status,
            sourceUrl: candidacy.sourceUrl,
            sourceLabel: candidacy.sourceLabel,
          })),
          politician: {
            slug: row.politician.slug,
            fullName: row.politician.fullName,
            currentParty: row.politician.currentParty,
          },
        },
      ];
    }),
  };
}
