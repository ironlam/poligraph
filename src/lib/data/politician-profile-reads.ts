import { db } from "@/lib/db";
import { isMissingTableError } from "@/lib/data/commune-population";
import {
  Prisma,
  type DateEvidence,
  type GovernmentFunctionEnd,
  type PublicationStatus,
} from "@/generated/prisma";
import { PARRAINAGES_FICHES_CANDIDATS } from "@/config/parrainages";
import { getPublicFactCheckWhere, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";
import { CONFIRMED_MENTION_WHERE } from "@/lib/factchecks/mention-review";
import { PUBLIC_EVENT_WHERE } from "@/lib/affairs/events/public";
import { VOTE_RECENT_FIRST } from "@/lib/votes/scrutin-order";
import {
  computePoliticianVotingStats,
  buildPoliticianParliamentaryCard,
  getPoliticianDissidence,
  voteStatsService,
} from "@/services/voteStats";

/**
 * Uncached reads behind the politician profile. No `"use cache"`, no cache tag: the cached readers
 * in `politicians.ts` delegate here, and so can the profile document builder, Inngest jobs and
 * scripts, where a Next cache read returns a stale value or throws.
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
 * No page calls it directly: the profile document builder does (`profile-snapshot/build.ts`), and
 * `/politiques/[slug]` and the candidate routes read the stored document.
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
          // Commune population feeds the SEO richness predicate (politician-robots). The count
          // of published council decisions decides the link to them (#1052, lot 2).
          localData: {
            select: {
              commune: {
                select: {
                  id: true,
                  population: true,
                  _count: {
                    select: {
                      decisions: {
                        where: {
                          status: "PUBLISHED",
                          institution: { kind: "CONSEIL_MUNICIPAL" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          // Link from a ministerial mandate to its government page, when that one is published.
          governmentData: {
            select: {
              endKind: true,
              government: {
                select: {
                  slug: true,
                  name: true,
                  publicationStatus: true,
                  currentAffairsActId: true,
                  resignedEvidence: true,
                },
              },
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

  // A mention matched on a last name alone is an indexation signal only once an admin validated it
  // (mention-review.ts). `_count.factCheckMentions` stays the count of what the page lists, which
  // the title, description and share card print. The flag is set only on a profile whose every
  // public mention waits for review, so the stored documents of all other profiles keep their
  // fingerprint; a document stored before it was read lacks it and keeps the former verdict until
  // its next rebuild.
  const factChecksAwaitReview =
    politician._count.factCheckMentions > 0 &&
    !(await db.factCheckMention.findFirst({
      where: {
        politicianId: politician.id,
        factCheck: getPublicFactCheckWhere(),
        ...CONFIRMED_MENTION_WHERE,
      },
      select: { id: true },
    }));

  // A party with no public member is not nameable on a public surface.
  // `governmentData` is kept only for a PUBLISHED government. Prisma returns `null` for every other
  // mandate, and a key added to every stored document would change every profile's fingerprint
  // (mass invalidation). Documents stored before it was read lack the key too.
  // `localData.commune` carries the population only, plus `decisionsCommuneId` when the commune
  // has a published council decision (#1052). Same reason: a key or a count added to every
  // stored document would change their fingerprints, and a count would re-invalidate every
  // elected official of the commune at each new decision. Only the boolean reaches the document.
  const mandates: Array<
    Omit<(typeof politician.mandates)[number], "party" | "governmentData" | "localData"> & {
      party: { name: string } | null;
      governmentData?: ProfileMandateGovernment;
      localData: ProfileMandateLocal | null;
    }
  > = politician.mandates.map(({ governmentData, localData, ...mandate }) => ({
    ...mandate,
    party:
      mandate.party && mandate.party._count.politicians > 0 ? { name: mandate.party.name } : null,
    ...(governmentData?.government?.publicationStatus === "PUBLISHED" ? { governmentData } : {}),
    localData: localData && { commune: localData.commune && profileCommune(localData.commune) },
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
  return {
    ...politician,
    mandates,
    partyHistory,
    ...(factChecksAwaitReview ? { factChecksAwaitReview: true as const } : {}),
  };
}

/** Commune of a local mandate, as stored in the profile document. */
export type ProfileMandateLocal = {
  commune: { population: number | null; decisionsCommuneId?: string } | null;
};

export function profileCommune(commune: {
  id: string;
  population: number | null;
  _count: { decisions: number };
}): NonNullable<ProfileMandateLocal["commune"]> {
  const { id, _count, ...rest } = commune;
  return _count.decisions > 0 ? { ...rest, decisionsCommuneId: id } : rest;
}

/** Government of a ministerial mandate, as stored in the profile document. */
export type ProfileMandateGovernment = {
  endKind: GovernmentFunctionEnd | null;
  government: {
    slug: string;
    name: string;
    publicationStatus: PublicationStatus;
    /** Act attesting the current-affairs regime of the resigned government; null if none. */
    currentAffairsActId: string | null;
    /** Evidence of the resignation date; the regime is attested only with an ACT. */
    resignedEvidence?: DateEvidence | null;
  } | null;
};

/** The non-null shape of the identity read, for components that receive it as a prop. */
export type PoliticianIdentity = NonNullable<Awaited<ReturnType<typeof readPoliticianIdentity>>>;

/**
 * The tab bodies of a politician profile: the three relations nobody reads above the fold, headed
 * by the affairs tree, which is the deepest read of the whole fiche.
 *
 * Read by the profile document builder, which stores it with the identity so the page never sees
 * one without the other.
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
            where: PUBLIC_EVENT_WHERE,
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
      orderBy: VOTE_RECENT_FIRST,
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

/** One presidential presentation made by the person, as published by the Conseil constitutionnel. */
export interface ProfileParrainage {
  electionSlug: string;
  candidateName: string;
  mandateLabel: string;
  constituencyLabel: string;
  /** ISO date (yyyy-mm-dd) of the publication. */
  publishedOn: string;
}

/**
 * Presentations linked to this politician, oldest first. Only rows whose link was established by
 * the identity step carry a `politicianId`, so nothing here rests on a name. Empty for almost
 * everyone, and empty too when the table does not exist yet.
 */
export async function readProfileParrainages(politicianId: string): Promise<ProfileParrainage[]> {
  let rows;
  try {
    rows = await db.parrainage.findMany({
      where: { politicianId },
      orderBy: [{ publishedOn: "asc" }, { candidateName: "asc" }],
      take: 20,
      select: {
        candidateName: true,
        mandateLabel: true,
        constituencyLabel: true,
        publishedOn: true,
        election: { select: { slug: true } },
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
  return rows.map(({ election, publishedOn, ...row }) => ({
    ...row,
    electionSlug: election.slug,
    publishedOn: publishedOn.toISOString().slice(0, 10),
  }));
}

/** Presentations a person received as a presidential candidate, for one election. */
export interface ProfileParrainagesRecus {
  electionSlug: string;
  /** As published by the Conseil constitutionnel: "NOM Prénom". */
  candidateName: string;
  total: number;
  /** Departments and collectivities, counted on the published label. */
  departements: number;
}

/**
 * Counts of the presentations received by this person as a candidate. Two links only, never a
 * name: the candidacy in base that the importer matched, or the hand-checked table of
 * `PARRAINAGES_FICHES_CANDIDATS`. Either one designates a published candidate of an election,
 * and every presentation of that candidate is counted. Empty for almost everyone, and when the table does not exist.
 */
export async function readProfileParrainagesRecus(politician: {
  id: string;
  slug: string;
}): Promise<ProfileParrainagesRecus[]> {
  const viaTable = Object.entries(PARRAINAGES_FICHES_CANDIDATS).flatMap(([electionSlug, table]) =>
    Object.entries(table)
      .filter(([, slug]) => slug === politician.slug)
      .map(
        ([candidateName]) =>
          Prisma.sql`(e."slug" = ${electionSlug} AND p."candidateName" = ${candidateName})`
      )
  );
  // The link names a (election, published candidate) pair; the count then covers every row of
  // that pair. Rows imported before the candidacy existed keep a null `candidacyId`: counting
  // only the linked rows would give a smaller figure than the candidate page.
  const viaCandidacy = Prisma.sql`(p."electionId", p."candidateName") IN (
    SELECT linked."electionId", linked."candidateName"
    FROM "Parrainage" linked JOIN "Candidacy" c ON c."id" = linked."candidacyId"
    WHERE c."politicianId" = ${politician.id}
  )`;
  const where = viaTable.length
    ? Prisma.sql`${viaCandidacy} OR ${Prisma.join(viaTable, " OR ")}`
    : viaCandidacy;
  try {
    return await db.$queryRaw<ProfileParrainagesRecus[]>(Prisma.sql`
      SELECT e."slug" AS "electionSlug", p."candidateName",
             count(*)::int AS "total", count(DISTINCT p."departmentLabel")::int AS "departements"
      FROM "Parrainage" p
      JOIN "Election" e ON e."id" = p."electionId"
      WHERE ${where}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}
