import { cache } from "react";
import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import type { PoliticianIndexSignals } from "./politician-robots";

/**
 * Loads just the index-richness signals of a politician, for the profile
 * sub-tabs (/politiques/[slug]/votes, /politiques/[slug]/relations).
 *
 * The profile itself already derives these from the full `getPolitician()`
 * payload, but the sub-tabs only query what they render, so they had no way to
 * apply `politicianRobotsMetadata()` and stayed indexable for *every* slug —
 * including the ~34k RNE-imported mayors whose bare profile is already
 * noindexed. Two extra crawlable URLs per bare profile is the same index bloat
 * as issue #385, one level down.
 *
 * `take: 1` on the relations is deliberate: `isIndexablePolitician()` only ever
 * tests these counts for `> 0`, so a single row answers the question and the
 * query stays cheap on politicians with hundreds of votes or declarations.
 */
export const getPoliticianIndexSignals = cache(async function getPoliticianIndexSignals(
  slug: string
): Promise<PoliticianIndexSignals | null> {
  "use cache";
  cacheTag(`politician:${slug}`, "politicians");
  cacheLife("synced");

  const politician = await db.politician.findUnique({
    where: { slug },
    select: {
      biography: true,
      mandates: {
        select: {
          type: true,
          // Commune population feeds the MAIRE branch of the richness predicate.
          localData: { select: { commune: { select: { population: true } } } },
        },
      },
      affairs: { where: { publicationStatus: "PUBLISHED" }, select: { id: true }, take: 1 },
      factCheckMentions: { select: { id: true }, take: 1 },
      declarations: { select: { id: true }, take: 1 },
    },
  });

  if (!politician) return null;

  return {
    mandates: politician.mandates.map((m) => ({
      type: m.type,
      communePopulation: m.localData?.commune?.population ?? null,
    })),
    publishedAffairsCount: politician.affairs.length,
    factCheckMentionsCount: politician.factCheckMentions.length,
    declarationsCount: politician.declarations.length,
    biography: politician.biography,
  };
});
