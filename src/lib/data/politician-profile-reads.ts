import { db } from "@/lib/db";
import { getPublicFactCheckWhere, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";
import {
  computePoliticianVotingStats,
  buildPoliticianParliamentaryCard,
  getPoliticianDissidence,
  voteStatsService,
} from "@/services/voteStats";

/**
 * Uncached reads behind the politician profile. No `"use cache"`, no cache tag: the cached readers
 * in `politicians.ts` and `app/politiques/[slug]/vote-stats.ts` delegate here, and so can Inngest
 * jobs and scripts, where a Next cache read returns a stale value or throws.
 */

type PoliticianWhere = { slug: string } | { id: string };

/**
 * Everything the top of a politician profile reads: the header, `generateMetadata`, the JSON-LD and
 * the robots predicate. Nothing that only a tab body shows.
 *
 * Split out of the former `getPolitician` because `generateMetadata` and the page component render
 * concurrently. As long as the metadata read the affairs tree, the critical path of the page waited
 * on the deepest relation of the whole fiche for two numbers it only ever took the length of. Those
 * two are filtered `_count`s here, under the same public predicates as the rows they count, so the
 * figures the robots predicate sees are unchanged.
 *
 * The tab bodies read `getPoliticianDossier` instead, behind their own Suspense boundary.
 */
export async function readPoliticianIdentity(where: PoliticianWhere) {
  const politician = await db.politician.findUnique({
    where: { ...where, ...PUBLIC_POLITICIAN_WHERE },
    include: {
      currentParty: true,
      // Counted rather than loaded: the only thing any caller of this read asks of these two
      // relations is how many there are. Same `where` as the dossier read that lists them.
      _count: {
        select: {
          affairs: { where: { ...getPublishedAffairWhere(), politician: PUBLIC_POLITICIAN_WHERE } },
          factCheckMentions: { where: { factCheck: getPublicFactCheckWhere() } },
        },
      },
      mandates: {
        orderBy: { startDate: "desc" },
        include: {
          // Who the person sat with, shown on the career timeline: the party
          // for a party leadership, the group for a parliamentary mandate.
          party: {
            select: {
              name: true,
              _count: { select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } } },
            },
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
      // Kept on the critical path: `generateMetadata` reads the latest DIA's `details` to build the
      // description, so a count would not do here.
      declarations: {
        orderBy: { year: "desc" },
      },
      externalIds: {
        select: { url: true, source: true, metadata: true },
      },
      // Also on the critical path: `PoliticianHeader` renders the party roles still held.
      partyHistory: {
        include: {
          party: {
            select: {
              name: true,
              shortName: true,
              slug: true,
              color: true,
              _count: { select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } } },
            },
          },
        },
        orderBy: { startDate: "desc" },
      },
    },
  });

  if (!politician) return null;

  // A party with no public member is not nameable on a public surface.
  const mandates = politician.mandates.map((mandate) => ({
    ...mandate,
    party:
      mandate.party && mandate.party._count.politicians > 0 ? { name: mandate.party.name } : null,
  }));
  const partyHistory = politician.partyHistory.flatMap((membership) => {
    if (!membership.party || membership.party._count.politicians === 0) return [];
    return [
      {
        ...membership,
        party: {
          name: membership.party.name,
          shortName: membership.party.shortName,
          slug: membership.party.slug,
          color: membership.party.color,
        },
      },
    ];
  });
  return { ...politician, mandates, partyHistory };
}

/** The non-null shape of the identity read, for components that receive it as a prop. */
export type PoliticianIdentity = NonNullable<Awaited<ReturnType<typeof readPoliticianIdentity>>>;

/**
 * The tab bodies of a politician profile: the three relations nobody reads above the fold, headed
 * by the affairs tree, which is the deepest read of the whole fiche.
 *
 * Same cache tags as `getPoliticianIdentity` on purpose. Splitting the tags would decouple the two
 * entries' invalidation, which is worth doing, but it changes when each surface goes stale and that
 * is a separate decision from moving the read off the critical path.
 */
export async function readPoliticianDossier(where: PoliticianWhere) {
  const politician = await db.politician.findUnique({
    where: { ...where, ...PUBLIC_POLITICIAN_WHERE },
    select: {
      affairs: {
        where: { ...getPublishedAffairWhere(), politician: PUBLIC_POLITICIAN_WHERE },
        include: {
          sources: true,
          partyAtTime: {
            include: {
              _count: { select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } } },
            },
          },
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
      factCheckMentions: {
        where: { factCheck: getPublicFactCheckWhere() },
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

  return {
    ...politician,
    // Decimal is not serialisable across the server/client boundary.
    affairs: politician.affairs.map((affair) => ({
      ...affair,
      partyAtTime:
        affair.partyAtTime && affair.partyAtTime._count.politicians > 0
          ? (() => {
              const { _count: _publicMembers, ...partyAtTime } = affair.partyAtTime;
              return partyAtTime;
            })()
          : null,
      fineAmount: affair.fineAmount ? Number(affair.fineAmount) : null,
    })),
  };
}

export type PoliticianDossier = NonNullable<Awaited<ReturnType<typeof readPoliticianDossier>>>;

/**
 * One boundary, four reads in flight at most: the pool holds four connections (@/config/database)
 * and a render wider than that queues behind itself (POLIGRAPH-2X). The card reuses these stats
 * rather than computing them again, and its dissidence query is read with them.
 */
export async function readProfileVoteStats(
  politicianId: string,
  mandateType: "DEPUTE" | "SENATEUR"
) {
  const [stats, recentVotes, themeDistribution, dissidence] = await Promise.all([
    computePoliticianVotingStats(politicianId, mandateType),
    db.vote.findMany({
      where: { politicianId },
      include: {
        scrutin: {
          select: {
            id: true,
            // Slug drives the link: /parlement/votes/<cuid> only 308s to the
            // slug URL, so linking by id made every "Derniers votes" row an
            // internal redirect hop for crawlers.
            slug: true,
            title: true,
            votingDate: true,
            result: true,
            // Plan 6: public policy title (shown only when APPROVED + valid).
            policyTitle: {
              select: {
                status: true,
                policyTitle: true,
                policySubtitle: true,
                officialSourceUrl: true,
                proceduralLabel: true,
              },
            },
          },
        },
      },
      orderBy: { votingDate: "desc" },
      take: 5,
    }),
    voteStatsService.getPoliticianThemeDistribution(politicianId),
    getPoliticianDissidence(politicianId),
  ]);

  return {
    voteData: { stats, recentVotes, themeDistribution },
    parliamentaryCard: buildPoliticianParliamentaryCard(mandateType, stats, dissidence),
  };
}

export type ProfileVoteStats = Awaited<ReturnType<typeof readProfileVoteStats>>;
