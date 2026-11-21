import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { FactCheckRating } from "@/generated/prisma";
import { db } from "@/lib/db";
import { getPublicFactCheckWhere } from "@/lib/api/public-contract";
import { VERDICT_GROUPS } from "@/config/labels";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { isIndexableFactCheckPolitician } from "@/lib/seo/factcheck-robots";
import {
  queryAuthor,
  queryCandidacy,
  summarizeVerdicts,
  type AuthorIdentity,
  type VerdictBreakdown,
  type VerdictGroup,
} from "./factcheck-context";

/**
 * Landing page of the fact-checks about one politician, /factchecks/politique/[slug]: the claims
 * attributed to them, counted by verdict and by outlet, and the fact-checks that only cite them.
 * Counts and links only, read from the base; no text is generated.
 */

export const VERDICT_GROUP_KEYS = Object.keys(VERDICT_GROUPS) as VerdictGroup[];

export interface PoliticianFactCheckItem {
  slug: string;
  title: string;
  claimText: string;
  verdictRating: FactCheckRating;
  source: string;
  publishedAt: Date;
}

export interface SourceBreakdown extends VerdictBreakdown {
  name: string;
  total: number;
}

export interface PoliticianFactCheckLanding {
  author: AuthorIdentity;
  /** Sourced presidential 2027 candidacy: the page links to the candidate fiche. */
  hasCandidacy: boolean;
  /** Fact-checks where the politician is the claimant, most recent first. */
  claimed: PoliticianFactCheckItem[];
  /** Fact-checks that cite the politician without them being the claimant. */
  cited: PoliticianFactCheckItem[];
  breakdown: VerdictBreakdown;
  bySource: SourceBreakdown[];
  /** Year of the oldest claimed fact-check, UTC. */
  firstYear: number | null;
  indexable: boolean;
}

export function verdictGroupOf(rating: FactCheckRating): VerdictGroup | null {
  return VERDICT_GROUP_KEYS.find((group) => VERDICT_GROUPS[group].includes(rating)) ?? null;
}

/** Outlets by descending total, then by name, so the order never depends on query order. */
export function summarizeBySource(
  items: Pick<PoliticianFactCheckItem, "source" | "verdictRating">[]
) {
  const bySource = new Map<string, FactCheckRating[]>();
  for (const item of items) {
    const list = bySource.get(item.source) ?? [];
    list.push(item.verdictRating);
    bySource.set(item.source, list);
  }
  return [...bySource.entries()]
    .map(
      ([name, ratings]): SourceBreakdown => ({
        name,
        total: ratings.length,
        ...summarizeVerdicts(ratings),
      })
    )
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "fr"));
}

/** Items grouped by UTC year of publication, most recent year first, item order kept. */
export function groupByYear<T extends { publishedAt: Date }>(items: T[]) {
  const years = new Map<number, T[]>();
  for (const item of items) {
    const year = item.publishedAt.getUTCFullYear();
    const list = years.get(year) ?? [];
    list.push(item);
    years.set(year, list);
  }
  return [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, list]) => ({ year, items: list }));
}

export async function queryPoliticianFactCheckLanding(
  slug: string
): Promise<PoliticianFactCheckLanding | null> {
  const author = await queryAuthor(slug);
  if (!author) return null;

  const mentions = await db.factCheckMention.findMany({
    where: {
      politicianId: author.id,
      factCheck: { ...getPublicFactCheckWhere(), slug: { not: null } },
    },
    select: {
      isClaimant: true,
      factCheck: {
        select: {
          slug: true,
          title: true,
          claimText: true,
          verdictRating: true,
          source: true,
          publishedAt: true,
        },
      },
    },
    orderBy: [{ factCheck: { publishedAt: "desc" } }, { factCheck: { createdAt: "desc" } }],
  });
  if (mentions.length === 0) return null;

  const toItem = (m: (typeof mentions)[number]): PoliticianFactCheckItem => ({
    ...m.factCheck,
    slug: m.factCheck.slug!,
  });
  const claimed = mentions.filter((m) => m.isClaimant).map(toItem);
  const cited = mentions.filter((m) => !m.isClaimant).map(toItem);
  const candidacy = await queryCandidacy(author.id);

  return {
    author: author.identity,
    hasCandidacy: candidacy !== null,
    claimed,
    cited,
    breakdown: summarizeVerdicts(claimed.map((f) => f.verdictRating)),
    bySource: summarizeBySource(claimed),
    firstYear: claimed.length ? claimed.at(-1)!.publishedAt.getUTCFullYear() : null,
    indexable: isIndexableFactCheckPolitician(claimed.length),
  };
}

/**
 * Cached entry point, tagged like the fact-check context: the fact-checks, the politician's
 * profile, the elections and the candidacies of the presidential election.
 */
export async function getPoliticianFactCheckLanding(
  slug: string
): Promise<PoliticianFactCheckLanding | null> {
  "use cache";
  cacheTag("factchecks", `politician:${slug}`, "elections");
  cacheLife("synced");
  const election = await db.election.findUnique({
    where: { slug: PRESIDENTIELLE_2027_SLUG },
    select: { id: true },
  });
  if (election) cacheTag(`election-candidacies:${election.id}`);
  return queryPoliticianFactCheckLanding(slug);
}

export function factCheckPoliticianPath(slug: string): string {
  return `/factchecks/politique/${slug}`;
}
