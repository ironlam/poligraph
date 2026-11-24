import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { Prisma } from "@/generated/prisma";
import type { CandidacyStatus, Chamber, FactCheckRating, MandateType } from "@/generated/prisma";
import { db } from "@/lib/db";
import {
  PUBLIC_POLITICIAN_PUBLICATION_STATUS,
  PUBLIC_POLITICIAN_WHERE,
  getPublicFactCheckSqlWhere,
  getPublicFactCheckWhere,
} from "@/lib/api/public-contract";
import { isFicheCandidatPublishable } from "@/config/publication-gates";
import { VERDICT_GROUPS } from "@/config/labels";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { SCRUTIN_THEMES, type ScrutinTheme } from "@/config/scrutin-themes";
import { VOTE_RECENT_FIRST } from "@/lib/votes/scrutin-order";
import { isIndexableFactCheck } from "@/lib/seo/factcheck-robots";
import { getPoliticianFactcheckContext } from "./factchecks";

/**
 * Context blocks of a fact-check page: who is speaking, their record with the fact-checkers, their
 * presidential candidacy, what Parliament voted the day they spoke, and their party. Everything
 * here is a count or a link read from the base; no text is generated.
 *
 * A block with nothing to show is `null`, and the page renders nothing for it.
 *
 * Reads run one after the other on purpose: `"use cache"` is per process in production, so each
 * render of an uncached page pays for these queries, and the pool holds four connections.
 */

/** Positions that count as taking part in a scrutin. ABSENT and NON_VOTANT do not. */
export const PARTICIPATION_POSITIONS = ["POUR", "CONTRE", "ABSTENTION"] as const;
type ParticipationPosition = (typeof PARTICIPATION_POSITIONS)[number];

/** Mandates that name a chamber come first when several are current. */
const PARLIAMENTARY_MANDATES: MandateType[] = ["DEPUTE", "SENATEUR", "DEPUTE_EUROPEEN"];

export const RECENT_FACTCHECKS_LIMIT = 5;
export const CLAIM_DAY_MAX_DOSSIERS = 3;
export const CLAIM_DAY_SAMPLE_VOTES = 3;
export const THEME_RECENT_VOTES = 3;

export type VerdictGroup = keyof typeof VERDICT_GROUPS;
export type VerdictBreakdown = Record<VerdictGroup, number>;

export interface FactCheckContextInput {
  factCheckSlug: string;
  /** Slug of the single published claimant. `null` when there is none or several. */
  authorSlug: string | null;
  /** `YYYY-MM-DD` of the claim, `null` when the source gives no date. */
  claimDay: string | null;
  /** Theme validated in the admin. A proposal of the model alone never reaches this field. */
  theme?: ScrutinTheme | null;
}

export interface AuthorIdentity {
  slug: string;
  fullName: string;
  civility: string | null;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  mandateTitle: string | null;
  mandateType: MandateType | null;
  constituency: string | null;
  group: { code: string; name: string } | null;
  party: {
    id: string;
    slug: string | null;
    name: string;
    shortName: string;
    color: string | null;
  } | null;
}

export interface RecentFactCheck {
  slug: string;
  title: string;
  verdictRating: FactCheckRating;
  source: string;
  publishedAt: Date;
}

export interface AuthorRecord {
  total: number;
  breakdown: VerdictBreakdown;
  sources: { name: string; count: number }[];
  recent: RecentFactCheck[];
}

export interface AuthorCandidacy {
  status: CandidacyStatus;
}

export interface ClaimDayDossier {
  slug: string | null;
  title: string;
  scrutinCount: number;
}

export interface ClaimDayChamber {
  chamber: Chamber;
  scrutinCount: number;
  dossiers: ClaimDayDossier[];
  /** Scrutins on a dossier beyond the first three, plus scrutins with no dossier in base. */
  otherCount: number;
}

export interface ClaimDayVote {
  position: ParticipationPosition;
  scrutinSlug: string | null;
  scrutinTitle: string;
  result: "ADOPTED" | "REJECTED";
}

export interface ClaimDay {
  day: string;
  chambers: ClaimDayChamber[];
  /** The author's own participation that day: always at least one vote, or no block at all. */
  participation: Record<ParticipationPosition, number> & { total: number };
  sample: ClaimDayVote[];
}

export interface ThemeVote {
  position: ParticipationPosition;
  votingDate: Date;
  scrutinSlug: string | null;
  scrutinTitle: string;
  result: "ADOPTED" | "REJECTED";
}

export interface ThemeVotes {
  theme: ScrutinTheme;
  /** The author's positions on the scrutins of the theme: always at least one, or no block. */
  participation: Record<ParticipationPosition, number> & { total: number };
  recent: ThemeVote[];
  /** False when the author has no vote on a text, an article or a motion of the theme, and the
   *  recent votes shown are amendments. */
  recentExcludesAmendments: boolean;
}

export interface PartyRecord {
  slug: string | null;
  name: string;
  shortName: string;
  factCheckCount: number;
  personCount: number;
}

export interface FactCheckContext {
  author: AuthorIdentity | null;
  record: AuthorRecord | null;
  candidacy: AuthorCandidacy | null;
  claimDay: ClaimDay | null;
  party: PartyRecord | null;
  /** The author's votes on the validated theme of the claim: a block specific to this claim. */
  themeVotes: ThemeVotes | null;
  /** Indexing verdict, computed here once and read by the page metadata. */
  indexable: boolean;
}

export const EMPTY_FACTCHECK_CONTEXT: FactCheckContext = {
  author: null,
  record: null,
  candidacy: null,
  claimDay: null,
  party: null,
  themeVotes: null,
  indexable: false,
};

/**
 * The context input of a fact-check, from its mentions already restricted to published profiles.
 * Context is read for a single identified author only: with several, no block can say whose
 * record it shows.
 */
export function factCheckContextInput(factCheck: {
  slug: string;
  claimDate: Date | null;
  theme?: string | null;
  themeReviewedAt?: Date | null;
  mentions: ReadonlyArray<{ isClaimant: boolean; politician: { slug: string } }>;
}): FactCheckContextInput {
  const claimants = factCheck.mentions.filter((m) => m.isClaimant);
  return {
    factCheckSlug: factCheck.slug,
    authorSlug: claimants.length === 1 ? claimants[0]!.politician.slug : null,
    claimDay: factCheck.claimDate ? factCheck.claimDate.toISOString().slice(0, 10) : null,
    theme: validatedTheme(factCheck.theme, factCheck.themeReviewedAt),
  };
}

/** A theme counts once validated in the admin, and only among the themes scrutins carry. */
export function validatedTheme(
  theme: string | null | undefined,
  reviewedAt: Date | null | undefined
): ScrutinTheme | null {
  if (!reviewedAt || !theme) return null;
  return (SCRUTIN_THEMES as readonly string[]).includes(theme) ? (theme as ScrutinTheme) : null;
}

/** The indexing verdict of a context: the author's identity, then the blocks that carry content. */
export function isIndexableFactCheckContext(context: Omit<FactCheckContext, "indexable">): boolean {
  return isIndexableFactCheck({
    hasPublishedAuthor: context.author !== null,
    authorFactCheckCount: context.record?.total ?? 0,
    hasCandidacy: context.candidacy !== null,
    hasClaimDayVotes: context.claimDay !== null,
    hasThemeVotes: context.themeVotes !== null,
  });
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function summarizeVerdicts(ratings: FactCheckRating[]): VerdictBreakdown {
  const breakdown: VerdictBreakdown = { vrai: 0, trompeur: 0, faux: 0, inverifiable: 0 };
  for (const rating of ratings) {
    for (const group of Object.keys(VERDICT_GROUPS) as VerdictGroup[]) {
      if (VERDICT_GROUPS[group].includes(rating)) {
        breakdown[group]++;
        break;
      }
    }
  }
  return breakdown;
}

/** Sources by descending count, then by name, so the order never depends on query order. */
export function summarizeSources(sources: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of sources) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));
}

export function summarizeParticipation(positions: string[]): ClaimDay["participation"] {
  const out = { POUR: 0, CONTRE: 0, ABSTENTION: 0, total: 0 };
  for (const p of positions) {
    if ((PARTICIPATION_POSITIONS as readonly string[]).includes(p)) {
      out[p as ParticipationPosition]++;
      out.total++;
    }
  }
  return out;
}

/**
 * Groups the day's scrutins by chamber, then by dossier. Dossiers are ranked by scrutin count,
 * then by title; past `CLAIM_DAY_MAX_DOSSIERS`, and for scrutins with no dossier, the count goes
 * to `otherCount` and is never attributed to a text.
 */
export function groupClaimDayScrutins(
  rows: {
    chamber: Chamber;
    dossierSlug: string | null;
    dossierTitle: string | null;
    count: number;
  }[]
): ClaimDayChamber[] {
  const byChamber = new Map<Chamber, typeof rows>();
  for (const row of rows) {
    const list = byChamber.get(row.chamber) ?? [];
    list.push(row);
    byChamber.set(row.chamber, list);
  }
  const chambers: ClaimDayChamber[] = [];
  for (const chamber of ["AN", "SENAT"] as Chamber[]) {
    const list = byChamber.get(chamber);
    if (!list) continue;
    const withDossier = list
      .filter((r) => r.dossierTitle !== null)
      .sort(
        (a, b) =>
          b.count - a.count || (a.dossierTitle ?? "").localeCompare(b.dossierTitle ?? "", "fr")
      );
    const shown = withDossier.slice(0, CLAIM_DAY_MAX_DOSSIERS);
    const scrutinCount = list.reduce((sum, r) => sum + r.count, 0);
    const shownCount = shown.reduce((sum, r) => sum + r.count, 0);
    chambers.push({
      chamber,
      scrutinCount,
      dossiers: shown.map((r) => ({
        slug: r.dossierSlug,
        title: r.dossierTitle!,
        scrutinCount: r.count,
      })),
      otherCount: scrutinCount - shownCount,
    });
  }
  return chambers;
}

function dayRange(day: string): { gte: Date; lt: Date } {
  const gte = new Date(`${day}T00:00:00.000Z`);
  return { gte, lt: new Date(gte.getTime() + 24 * 60 * 60 * 1000) };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function queryAuthor(
  slug: string
): Promise<{ id: string; identity: AuthorIdentity } | null> {
  const base = await getPoliticianFactcheckContext(slug);
  if (!base) return null;

  const row = await db.politician.findFirst({
    where: { slug, ...PUBLIC_POLITICIAN_WHERE },
    select: {
      id: true,
      civility: true,
      currentParty: { select: { id: true, slug: true, name: true, shortName: true, color: true } },
      mandates: {
        where: { isCurrent: true },
        orderBy: { startDate: "desc" },
        select: {
          type: true,
          title: true,
          constituency: true,
          startDate: true,
          parliamentaryData: {
            select: { parliamentaryGroup: { select: { code: true, name: true } } },
          },
        },
      },
    },
  });
  if (!row) return null;

  const full = row.mandates.find((m) => PARLIAMENTARY_MANDATES.includes(m.type)) ?? row.mandates[0];

  return {
    id: row.id,
    identity: {
      slug: base.slug,
      fullName: base.fullName,
      civility: row.civility,
      photoUrl: base.photoUrl,
      blobPhotoUrl: base.blobPhotoUrl,
      mandateTitle: full?.title ?? null,
      mandateType: full?.type ?? null,
      constituency: full?.constituency ?? null,
      group: full?.parliamentaryData?.parliamentaryGroup ?? null,
      party: row.currentParty,
    },
  };
}

async function queryRecord(
  politicianId: string,
  currentSlug: string
): Promise<AuthorRecord | null> {
  const mentions = await db.factCheckMention.findMany({
    where: { politicianId, isClaimant: true, factCheck: getPublicFactCheckWhere() },
    select: {
      factCheck: {
        select: { slug: true, title: true, verdictRating: true, source: true, publishedAt: true },
      },
    },
    orderBy: [{ factCheck: { publishedAt: "desc" } }, { factCheck: { createdAt: "desc" } }],
  });
  if (mentions.length === 0) return null;

  const all = mentions.map((m) => m.factCheck);
  return {
    total: all.length,
    breakdown: summarizeVerdicts(all.map((f) => f.verdictRating)),
    sources: summarizeSources(all.map((f) => f.source)),
    recent: all
      .filter((f): f is typeof f & { slug: string } => f.slug !== null && f.slug !== currentSlug)
      .slice(0, RECENT_FACTCHECKS_LIMIT),
  };
}

/** Same three conditions as the candidate fiche: no sourced status, no fiche, no block. */
export async function queryCandidacy(politicianId: string): Promise<AuthorCandidacy | null> {
  const row = await db.candidacy.findFirst({
    where: {
      politicianId,
      election: { slug: PRESIDENTIELLE_2027_SLUG },
      status: { not: null },
      sourceUrl: { not: null },
      sourceLabel: { not: null },
    },
    select: { status: true },
  });
  if (!row?.status) return null;
  if (!isFicheCandidatPublishable({ statusSourced: true })) return null;
  return { status: row.status };
}

async function queryClaimDay(politicianId: string, day: string): Promise<ClaimDay | null> {
  const range = dayRange(day);
  const votes = await db.vote.findMany({
    where: {
      politicianId,
      position: { in: [...PARTICIPATION_POSITIONS] },
      scrutin: { votingDate: range },
    },
    select: {
      position: true,
      scrutin: { select: { slug: true, title: true, result: true, type: true, sequence: true } },
    },
  });
  const participation = summarizeParticipation(votes.map((v) => v.position));
  // Never "did not vote": the author may have held no seat that day, or sat in government.
  if (participation.total === 0) return null;

  const grouped = await db.scrutin.groupBy({
    by: ["chamber", "dossierLegislatifId"],
    where: { votingDate: range },
    _count: { _all: true },
  });
  const dossierIds = grouped.map((g) => g.dossierLegislatifId).filter((id): id is string => !!id);
  const dossiers = dossierIds.length
    ? await db.legislativeDossier.findMany({
        where: { id: { in: dossierIds } },
        select: { id: true, slug: true, title: true, shortTitle: true },
      })
    : [];
  const dossierById = new Map(dossiers.map((d) => [d.id, d]));

  // Articles, motions and final votes before amendments: they decide something on the text.
  const sample = [...votes]
    .sort(
      (a, b) =>
        Number(a.scrutin.type === "AMENDEMENT") - Number(b.scrutin.type === "AMENDEMENT") ||
        a.scrutin.sequence - b.scrutin.sequence
    )
    .slice(0, CLAIM_DAY_SAMPLE_VOTES)
    .map((v) => ({
      position: v.position as ParticipationPosition,
      scrutinSlug: v.scrutin.slug,
      scrutinTitle: v.scrutin.title,
      result: v.scrutin.result,
    }));

  return {
    day,
    chambers: groupClaimDayScrutins(
      grouped.map((g) => {
        const d = g.dossierLegislatifId ? dossierById.get(g.dossierLegislatifId) : undefined;
        return {
          chamber: g.chamber,
          dossierSlug: d?.slug ?? null,
          dossierTitle: d ? (d.shortTitle ?? d.title) : null,
          count: g._count._all,
        };
      })
    ),
    participation,
    sample,
  };
}

async function queryThemeVotes(
  politicianId: string,
  theme: ScrutinTheme
): Promise<ThemeVotes | null> {
  const where = {
    politicianId,
    position: { in: [...PARTICIPATION_POSITIONS] },
    scrutin: { theme },
  };
  const grouped = await db.vote.groupBy({ by: ["position"], where, _count: { _all: true } });
  const participation = { POUR: 0, CONTRE: 0, ABSTENTION: 0, total: 0 };
  for (const g of grouped) {
    if ((PARTICIPATION_POSITIONS as readonly string[]).includes(g.position)) {
      participation[g.position as ParticipationPosition] += g._count._all;
      participation.total += g._count._all;
    }
  }
  // Never "did not vote": the author may have held no seat when those scrutins were held.
  if (participation.total === 0) return null;

  // Amendments are about four scrutins in five: the latest votes of a theme are nearly always
  // amendments to a single text. Votes on a whole text, an article or a motion come first.
  const select = {
    position: true,
    votingDate: true,
    scrutin: { select: { slug: true, title: true, result: true } },
  } as const;
  const onTexts = await db.vote.findMany({
    where: { ...where, scrutin: { theme, type: { not: "AMENDEMENT" as const } } },
    orderBy: VOTE_RECENT_FIRST,
    take: THEME_RECENT_VOTES,
    select,
  });
  const recent =
    onTexts.length > 0
      ? onTexts
      : await db.vote.findMany({
          where,
          orderBy: VOTE_RECENT_FIRST,
          take: THEME_RECENT_VOTES,
          select,
        });

  return {
    theme,
    participation,
    recent: recent.map((v) => ({
      position: v.position as ParticipationPosition,
      votingDate: v.votingDate,
      scrutinSlug: v.scrutin.slug,
      scrutinTitle: v.scrutin.title,
      result: v.scrutin.result,
    })),
    recentExcludesAmendments: onTexts.length > 0,
  };
}

async function queryParty(
  party: NonNullable<AuthorIdentity["party"]>
): Promise<PartyRecord | null> {
  const pub = getPublicFactCheckSqlWhere("fc");
  const rows = await db.$queryRaw<{ factchecks: bigint; people: bigint }[]>(Prisma.sql`
    SELECT count(DISTINCT fc.id) AS factchecks, count(DISTINCT p.id) AS people
    FROM "FactCheck" fc
    JOIN "FactCheckMention" m ON m."factCheckId" = fc.id AND m."isClaimant"
    JOIN "Politician" p ON p.id = m."politicianId" AND p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}
    JOIN "Party" pa ON pa.id = p."currentPartyId"
    WHERE ${pub} AND pa.id = ${party.id}`);
  const factCheckCount = Number(rows[0]?.factchecks ?? 0);
  if (factCheckCount === 0) return null;
  return {
    slug: party.slug,
    name: party.name,
    shortName: party.shortName,
    factCheckCount,
    personCount: Number(rows[0]?.people ?? 0),
  };
}

export async function queryFactCheckContext(
  input: FactCheckContextInput
): Promise<FactCheckContext> {
  if (!input.authorSlug) return EMPTY_FACTCHECK_CONTEXT;
  const author = await queryAuthor(input.authorSlug);
  if (!author) return EMPTY_FACTCHECK_CONTEXT;

  const record = await queryRecord(author.id, input.factCheckSlug);
  const candidacy = await queryCandidacy(author.id);
  const claimDay = input.claimDay ? await queryClaimDay(author.id, input.claimDay) : null;
  const party = author.identity.party ? await queryParty(author.identity.party) : null;
  const themeVotes = input.theme ? await queryThemeVotes(author.id, input.theme) : null;

  const blocks = { author: author.identity, record, candidacy, claimDay, party, themeVotes };
  return { ...blocks, indexable: isIndexableFactCheckContext(blocks) };
}

/**
 * Cached entry point. Tags: the fact-checks themselves, the author's profile, the votes of the
 * claim day, the elections, and the candidacies of the presidential election, keyed on its id like
 * the candidate fiche so that a candidacy edit reaches this page. The id is read inside the cached
 * scope rather than through `getPresidentialElectionId`, whose module also reads affairs: this page
 * shows none, and the MCP surface inventory would count it as an Affair surface.
 */
export async function getFactCheckContext(input: FactCheckContextInput): Promise<FactCheckContext> {
  if (!input.authorSlug) return EMPTY_FACTCHECK_CONTEXT;
  return getFactCheckContextCached(
    input.factCheckSlug,
    input.authorSlug,
    input.claimDay ?? "",
    input.theme ?? ""
  );
}

async function getFactCheckContextCached(
  factCheckSlug: string,
  authorSlug: string,
  claimDay: string,
  theme: ScrutinTheme | ""
): Promise<FactCheckContext> {
  "use cache";
  cacheTag("factchecks", `politician:${authorSlug}`, "votes", "elections");
  cacheLife("synced");
  const election = await db.election.findUnique({
    where: { slug: PRESIDENTIELLE_2027_SLUG },
    select: { id: true },
  });
  if (election) cacheTag(`election-candidacies:${election.id}`);
  return queryFactCheckContext({
    factCheckSlug,
    authorSlug,
    claimDay: claimDay || null,
    theme: theme || null,
  });
}
