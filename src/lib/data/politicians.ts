import { cache } from "react";
import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";

export const getPolitician = cache(async function getPolitician(slug: string) {
  "use cache";
  cacheTag(`politician:${slug}`, "politicians");
  cacheLife("synced");

  const politician = await db.politician.findUnique({
    where: { slug },
    include: {
      currentParty: true,
      mandates: {
        orderBy: { startDate: "desc" },
        include: {
          // Who the person sat with, shown on the career timeline: the party
          // for a party leadership, the group for a parliamentary mandate.
          party: {
            select: { name: true },
          },
          parliamentaryData: {
            select: {
              parliamentaryGroup: {
                select: { code: true, name: true, color: true },
              },
            },
          },
          europeanData: {
            select: {
              europeanGroup: { select: { name: true } },
            },
          },
          // Commune population feeds the SEO richness predicate (politician-robots).
          localData: {
            select: {
              commune: { select: { population: true } },
            },
          },
        },
      },
      affairs: {
        where: { publicationStatus: "PUBLISHED" },
        include: {
          sources: true,
          partyAtTime: true,
          events: {
            orderBy: { date: "asc" },
          },
          linkedAffair: {
            select: {
              id: true,
              slug: true,
              title: true,
              involvement: true,
              publicationStatus: true,
              politician: { select: { id: true, fullName: true, slug: true } },
            },
          },
          linkedBy: {
            where: { publicationStatus: "PUBLISHED" as const },
            select: {
              id: true,
              slug: true,
              title: true,
              involvement: true,
              publicationStatus: true,
              politician: { select: { id: true, fullName: true, slug: true } },
            },
          },
        },
        orderBy: { verdictDate: "desc" },
      },
      declarations: {
        orderBy: { year: "desc" },
      },
      factCheckMentions: {
        include: {
          factCheck: {
            select: {
              id: true,
              slug: true,
              title: true,
              claimText: true,
              claimant: true,
              verdictRating: true,
              source: true,
              sourceUrl: true,
              publishedAt: true,
            },
          },
        },
        orderBy: { factCheck: { publishedAt: "desc" } },
        take: 20,
      },
      partyHistory: {
        include: {
          party: {
            select: { name: true, shortName: true, slug: true, color: true },
          },
        },
        orderBy: { startDate: "desc" },
      },
      externalIds: {
        select: { url: true, source: true, metadata: true },
      },
      dossierAuthors: {
        include: {
          dossier: {
            select: {
              slug: true,
              shortTitle: true,
              title: true,
              number: true,
              status: true,
              filingDate: true,
            },
          },
        },
        orderBy: { dossier: { filingDate: "desc" } },
      },
    },
  });

  if (!politician) return null;

  // Serialize Decimal fields to numbers for client components
  return {
    ...politician,
    affairs: politician.affairs.map((affair) => ({
      ...affair,
      fineAmount: affair.fineAmount ? Number(affair.fineAmount) : null,
    })),
  };
});

export async function getPoliticianForComparison(slug: string) {
  "use cache";
  cacheTag(`politician:${slug}`, "votes");
  cacheLife("synced");

  const politician = await db.politician.findUnique({
    where: { slug },
    include: {
      currentParty: true,
      _count: {
        select: { factCheckMentions: true },
      },
      mandates: {
        orderBy: { startDate: "desc" },
      },
      affairs: {
        where: { publicationStatus: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
      },
      declarations: {
        orderBy: { year: "desc" },
      },
      votes: {
        include: {
          scrutin: true,
        },
        orderBy: { votingDate: "desc" },
        take: 500,
      },
      factCheckMentions: {
        include: {
          factCheck: {
            select: {
              id: true,
              title: true,
              claimant: true,
              verdictRating: true,
              source: true,
              sourceUrl: true,
              publishedAt: true,
            },
          },
        },
        orderBy: { factCheck: { publishedAt: "desc" } },
        take: 20,
      },
    },
  });

  if (!politician) return null;

  const voteStats = {
    total: politician.votes.length,
    pour: politician.votes.filter((v) => v.position === "POUR").length,
    contre: politician.votes.filter((v) => v.position === "CONTRE").length,
    abstention: politician.votes.filter((v) => v.position === "ABSTENTION").length,
    nonVotant: politician.votes.filter((v) => v.position === "NON_VOTANT").length,
    absent: politician.votes.filter((v) => v.position === "ABSENT").length,
  };

  return {
    ...politician,
    voteStats,
  };
}
