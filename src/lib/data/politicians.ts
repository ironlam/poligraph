import { cache } from "react";
import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { getPublicFactCheckWhere, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";
import {
  readPoliticianDossier,
  readPoliticianIdentity,
  type PoliticianIdentity,
} from "@/lib/data/politician-profile-reads";

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
export const getPoliticianIdentity = cache(async function getPoliticianIdentity(slug: string) {
  "use cache";
  cacheTag(`politician:${slug}`, "politicians");
  cacheLife("synced");

  return readPoliticianIdentity({ slug });
});

/** The non-null shape of `getPoliticianIdentity`, for components that receive it as a prop. */
export type { PoliticianIdentity };

/**
 * The tab bodies of a politician profile: the three relations nobody reads above the fold, headed
 * by the affairs tree, which is the deepest read of the whole fiche.
 *
 * Same cache tags as `getPoliticianIdentity` on purpose. Splitting the tags would decouple the two
 * entries' invalidation, which is worth doing, but it changes when each surface goes stale and that
 * is a separate decision from moving the read off the critical path.
 */
export const getPoliticianDossier = cache(async function getPoliticianDossier(slug: string) {
  "use cache";
  cacheTag(`politician:${slug}`, "politicians");
  cacheLife("synced");

  return readPoliticianDossier({ slug });
});

export async function getPoliticianForComparison(slug: string) {
  "use cache";
  cacheTag(`politician:${slug}`, "votes");
  cacheLife("synced");

  const politician = await db.politician.findUnique({
    where: { slug, ...PUBLIC_POLITICIAN_WHERE },
    include: {
      currentParty: true,
      _count: {
        select: { factCheckMentions: true },
      },
      mandates: {
        orderBy: { startDate: "desc" },
      },
      affairs: {
        where: { ...getPublishedAffairWhere(), politician: PUBLIC_POLITICIAN_WHERE },
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
        where: { factCheck: getPublicFactCheckWhere() },
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
