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

const AFFAIRS_PAGE_SIZE = 20;

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

export type PresidentialAffairsPageData = {
  affairs: PresidentialAffair[];
  total: number;
};

/**
 * Public judicial affairs attached to sourced presidential candidacies.
 * The result is deliberately bounded: the page is an SEO entry point, not an unpaginated export.
 */
export async function getPresidentialAffairs(
  electionSlug: string,
  page = 1
): Promise<PresidentialAffairsPageData> {
  const election = await db.election.findUnique({
    where: { slug: electionSlug },
    select: { id: true },
  });

  if (!election) return { affairs: [], total: 0 };
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  return getPresidentialAffairsCached(election.id, safePage);
}

async function getPresidentialAffairsCached(
  electionId: string,
  page: number
): Promise<PresidentialAffairsPageData> {
  "use cache";
  cacheTag(
    "affairs",
    `election-candidacies:${electionId}`,
    `election-affairs:${electionId}:page:${page}`
  );
  cacheLife("synced");

  const where = {
    ...getPublishedAffairWhere(),
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
      AND p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}
      AND EXISTS (
        SELECT 1
        FROM "Candidacy" c
        WHERE c."politicianId" = p."id"
          AND c."electionId" = ${electionId}
          AND c."status" IS NOT NULL
          AND c."sourceUrl" IS NOT NULL
          AND c."sourceLabel" IS NOT NULL
      )
    ORDER BY COALESCE(a."startDate", a."factsDate", a."createdAt") DESC, a."id" DESC
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
