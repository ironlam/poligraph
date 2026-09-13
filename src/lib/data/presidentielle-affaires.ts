import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";
import type { AffairCategory, AffairStatus, Involvement } from "@/generated/prisma";
import type { PartyDisplayRef } from "@/lib/affairs/party-display";

const MAX_AFFAIRS = 100;

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
  electionSlug: string
): Promise<PresidentialAffairsPageData> {
  "use cache";
  cacheTag("affairs", `election-candidacies:${electionSlug}`);
  cacheLife("synced");

  const where = {
    ...getPublishedAffairWhere(),
    politician: {
      ...PUBLIC_POLITICIAN_WHERE,
      candidacies: {
        some: {
          election: { slug: electionSlug },
          status: { not: null },
          sourceUrl: { not: null },
        },
      },
    },
  };

  const [rows, total] = await Promise.all([
    db.affair.findMany({
      where,
      orderBy: [
        { verdictDate: { sort: "desc", nulls: "last" } },
        { startDate: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: MAX_AFFAIRS,
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
                election: { slug: electionSlug },
                status: { not: null },
                sourceUrl: { not: null },
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

  return {
    total,
    affairs: rows.map((row) => ({
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
    })),
  };
}
