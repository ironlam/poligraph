import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { CandidacyStatus, ThemeCategory, VotePosition } from "@/generated/prisma";
import { getCategoriesForSuper } from "@/config/labels";
import { db } from "@/lib/db";
import { getConvictionOnlyWhere } from "@/lib/affairs/public-filters";
import { isSynthesisContradictedByMeasures } from "@/lib/presidentielle/candidate-synthesis";
import { pickMeasureSourceUrl } from "@/lib/presidentielle/measure-source";
import {
  computeThemeCorpusFingerprint,
  getThemeSynthesisState,
  indexThemeSynthesisMeasures,
  readThemeSynthesisClaims,
} from "@/lib/presidentielle/candidacy-theme-synthesis";
import { PRESIDENTIELLE_2027_SLUG, themeToSlug } from "@/lib/presidentielle/themes";
import {
  getPublicMeasureStatsByCandidacy,
  getPublicMeasuresByCandidacy,
  type PublicMeasure,
} from "./measures";

/**
 * The reverse of `getHubCandidacyField`: "the presidential candidacy of THIS politician".
 *
 * One doctrine governs this file, and it is a split between two populations:
 *
 * - identity, status and source are read WITHOUT the PUBLISHED-extension filter. A candidacy can be
 *   sourced and public knowledge months before anyone publishes its editorial extension, so
 *   filtering here would make the notice disappear from every fiche it exists for;
 * - measure counters are read WITH it, through `getPublicMeasureStatsByCandidacy`. Counting a
 *   measure that no subject page renders would announce measures the reader cannot reach.
 *
 * The same split is documented in `hub.ts` for the hub page. It is restated here because the
 * politician fiche is not the hub, and a reader of this file should not have to go looking.
 *
 * Scoped to the presidential election on purpose. No other election uses `CandidacyStatus` today,
 * so a generic "candidacy for the current election" would be speculative generality.
 */
export type PoliticianCandidacy = {
  /** The candidacy row, so the fiche can read its measures without resolving it a second time. */
  candidacyId: string;
  electionSlug: string;
  electionShortTitle: string;
  round1Date: Date | null;
  round2Date: Date | null;
  /** Non-null: a candidacy without a sourced status is not returned at all. */
  status: CandidacyStatus;
  sourceUrl: string;
  sourceLabel: string;
  partyLabel: string | null;
  partyLogoUrl: string | null;
  partyColor: string | null;
  programmeIdentified: boolean;
  declaredAt: Date | null;
  withdrewAt: Date | null;
  /**
   * Generated summary of this candidacy, null until a generation pass has produced one — and null
   * again once the measures published since have contradicted it. See
   * `isSynthesisContradictedByMeasures`: the fiche shows no summary rather than a stale one.
   */
  synthesis: string | null;
  synthesisGeneratedAt: Date | null;
  publishedMeasureCount: number;
  themesCoveredCount: number;
  primarySourceMeasureCount: number;
  lastReviewedAt: Date | null;
  round1Pct: number | null;
  round2Pct: number | null;
  isElected: boolean;
};

/**
 * Plain async, integration-testable. Pages call `getPoliticianPresidentialCandidacy`, which caches
 * this: a `"use cache"` boundary throws outside a Next request context, the same reason
 * `loadHubMeasureContext` and `loadSubjectPageData` are split this way.
 */
export async function loadPoliticianPresidentialCandidacy(
  politicianId: string
): Promise<PoliticianCandidacy | null> {
  const row = await db.candidacy.findFirst({
    where: {
      politicianId,
      election: { slug: PRESIDENTIELLE_2027_SLUG },
      // The three conditions that make the notice sayable at all. Without them there is no state to
      // render: the notice has no "I do not know" state, it simply does not appear.
      status: { not: null },
      sourceUrl: { not: null },
      sourceLabel: { not: null },
    },
    select: {
      id: true,
      status: true,
      sourceUrl: true,
      sourceLabel: true,
      partyLabel: true,
      party: { select: { name: true, shortName: true, logoUrl: true, color: true } },
      round1Pct: true,
      round2Pct: true,
      isElected: true,
      election: {
        select: { slug: true, title: true, shortTitle: true, round1Date: true, round2Date: true },
      },
      presidentialData: {
        select: {
          declaredAt: true,
          withdrewAt: true,
          synthesis: true,
          synthesisGeneratedAt: true,
        },
      },
    },
  });

  // Narrowing the three nullable columns the where clause already excluded. Defensive rather than
  // redundant: this is the only place that turns them into non-nullable fields.
  if (!row || row.status === null || row.sourceUrl === null || row.sourceLabel === null) {
    return null;
  }

  const [stats, programme] = await Promise.all([
    getPublicMeasureStatsByCandidacy(row.id),
    db.programEdition.findFirst({
      where: {
        election: { slug: PRESIDENTIELLE_2027_SLUG },
        publicationStatus: "PUBLISHED",
        candidacyId: row.id,
      },
      select: { id: true },
    }),
  ]);

  // Dropped together. The block's own caption dates the text ("Texte généré ... le 7 août"), so a
  // date left behind without the text it dates has nothing to describe.
  const synthesisContradicted = isSynthesisContradictedByMeasures({
    generatedAt: row.presidentialData?.synthesisGeneratedAt ?? null,
    firstMeasurePublishedAt: stats.firstPublishedAt,
  });

  return {
    candidacyId: row.id,
    electionSlug: row.election.slug,
    electionShortTitle: row.election.shortTitle ?? row.election.title,
    round1Date: row.election.round1Date,
    round2Date: row.election.round2Date,
    status: row.status,
    sourceUrl: row.sourceUrl,
    sourceLabel: row.sourceLabel,
    partyLabel: row.partyLabel ?? row.party?.shortName ?? row.party?.name ?? null,
    partyLogoUrl: row.party?.logoUrl ?? null,
    partyColor: row.party?.color ?? null,
    programmeIdentified: programme !== null,
    declaredAt: row.presidentialData?.declaredAt ?? null,
    withdrewAt: row.presidentialData?.withdrewAt ?? null,
    synthesis: synthesisContradicted ? null : (row.presidentialData?.synthesis ?? null),
    synthesisGeneratedAt: synthesisContradicted
      ? null
      : (row.presidentialData?.synthesisGeneratedAt ?? null),
    publishedMeasureCount: stats.measureCount,
    themesCoveredCount: stats.themesCoveredCount,
    primarySourceMeasureCount: stats.primarySourceMeasureCount,
    lastReviewedAt: stats.lastReviewedAt,
    round1Pct: row.round1Pct === null ? null : Number(row.round1Pct),
    round2Pct: row.round2Pct === null ? null : Number(row.round2Pct),
    isElected: row.isElected,
  };
}

export type CandidateThemeMeasure = {
  id: string;
  slug: string;
  text: string;
  sourceUrl: string | null;
};

export type CandidateThemeBreakdown = {
  theme: ThemeCategory;
  slug: string;
  measureCount: number;
  /** Human-published and current for this exact set of published revisions, otherwise absent. */
  synthesis: {
    claims: Array<{
      text: string;
      measures: CandidateThemeMeasure[];
    }>;
  } | null;
  /**
   * Every measure of the theme, not a sample.
   *
   * The fiche used to quote the first one and show a count for the rest, so a candidacy with
   * nineteen documented measures displayed thirteen of them at most, one per subject, and the
   * others existed only as a number. The measures ARE the fiche's subject; hiding them behind
   * their own count made the page describe work instead of showing it.
   */
  measures: CandidateThemeMeasure[];
  subtopics: Array<{ slug: string; label: string; count: number }>;
};

export type CandidateRecentVote = {
  id: string;
  position: VotePosition;
  votingDate: Date;
  scrutinTitle: string;
  scrutinId: string;
};

export type CandidateFicheDetail = {
  /** Themes carrying at least one measure, most documented first. */
  themes: CandidateThemeBreakdown[];
  recentVotes: CandidateRecentVote[];
  /** Every mandate ever held, for the header count. */
  mandateCount: number;
  /** Convictions for probity offences, pronounced at least at first instance. */
  probityConvictionCount: number;
  /** Probity convictions that can still be challenged on appeal or cassation. */
  probityNonDefinitiveConvictionCount: number;
};

/**
 * What the fiche shows beyond the header counters, in one read.
 *
 * The vote list is NOT joined to the measures: no scrutin is attached to any measure yet
 * (`MeasureVoteLink` is empty), so a "programme face aux votes" block would be an empty promise.
 * The last votes are shown as what they are, recent parliamentary activity, and the page says so
 * rather than implying a link the data does not carry.
 */
export async function loadCandidateFicheDetail(
  candidacyId: string,
  politicianId: string
): Promise<CandidateFicheDetail> {
  const [
    measures,
    mandates,
    probityConvictionCount,
    probityNonDefinitiveConvictionCount,
    themeSyntheses,
  ] = await Promise.all([
    getPublicMeasuresByCandidacy(candidacyId),
    db.mandate.findMany({ where: { politicianId }, select: { type: true } }),
    db.affair.count({
      where: {
        politicianId,
        ...getConvictionOnlyWhere(),
        category: { in: getCategoriesForSuper("PROBITE") },
      },
    }),
    db.affair.count({
      where: {
        politicianId,
        ...getConvictionOnlyWhere(),
        category: { in: getCategoriesForSuper("PROBITE") },
        status: {
          in: ["CONDAMNATION_PREMIERE_INSTANCE", "APPEL_EN_COURS", "POURVOI_EN_CASSATION"],
        },
      },
    }),
    db.candidacyThemeSynthesis.findMany({
      where: {
        candidacyPresidential: { candidacyId },
        status: "PUBLISHED",
      },
      select: {
        theme: true,
        evidence: true,
        status: true,
        corpusFingerprint: true,
      },
    }),
  ]);

  const synthesesByTheme = new Map(themeSyntheses.map((synthesis) => [synthesis.theme, synthesis]));

  const hasDeputyMandate = mandates.some((mandate) => mandate.type === "DEPUTE");
  // Votes on the presidential fiche describe work at the Assemblée nationale. A person who has
  // never been a député does not get a generic "votes" block assembled from another institution.
  const votes = hasDeputyMandate
    ? await db.vote.findMany({
        where: { politicianId, scrutin: { chamber: "AN" } },
        orderBy: { votingDate: "desc" },
        take: 5,
        select: {
          id: true,
          position: true,
          votingDate: true,
          scrutin: { select: { id: true, title: true } },
        },
      })
    : [];

  const byTheme = new Map<ThemeCategory, PublicMeasure[]>();
  for (const measure of measures) {
    const bucket = byTheme.get(measure.theme) ?? [];
    bucket.push(measure);
    byTheme.set(measure.theme, bucket);
  }

  const themes: CandidateThemeBreakdown[] = [...byTheme.entries()]
    .map(([theme, list]) => {
      const subtopicCounts = new Map<string, { label: string; count: number }>();
      for (const measure of list) {
        for (const subtopic of measure.subtopics) {
          const current = subtopicCounts.get(subtopic.slug);
          subtopicCounts.set(subtopic.slug, {
            label: subtopic.label,
            count: (current?.count ?? 0) + 1,
          });
        }
      }
      return {
        theme,
        slug: themeToSlug(theme),
        measureCount: list.length,
        synthesis: (() => {
          const stored = synthesesByTheme.get(theme) ?? null;
          const corpusMeasures = list.map((measure) => ({
            id: measure.id,
            revisionId: measure.publishedRevisionId,
            text: measure.text,
            details: measure.details,
          }));
          const currentFingerprint = computeThemeCorpusFingerprint({
            theme,
            measures: corpusMeasures,
          });
          if (getThemeSynthesisState(stored, currentFingerprint) !== "PUBLISHED" || !stored) {
            return null;
          }
          const publicMeasureById = new Map(
            list.map((measure) => [
              measure.id,
              {
                id: measure.id,
                slug: measure.slug,
                text: measure.text,
                sourceUrl: pickMeasureSourceUrl(measure.sources),
              },
            ])
          );
          const measureByRef = new Map(
            indexThemeSynthesisMeasures(corpusMeasures).map((measure) => [
              measure.ref,
              publicMeasureById.get(measure.id),
            ])
          );
          const claims = readThemeSynthesisClaims(stored.evidence).flatMap((claim) => {
            const cited = claim.measureRefs.flatMap((reference) => {
              const measure = measureByRef.get(reference);
              return measure ? [measure] : [];
            });
            return cited.length === claim.measureRefs.length
              ? [{ text: claim.text, measures: cited }]
              : [];
          });
          return claims.length > 0 ? { claims } : null;
        })(),
        measures: list.map((measure) => ({
          id: measure.id,
          slug: measure.slug,
          text: measure.text,
          sourceUrl: pickMeasureSourceUrl(measure.sources),
        })),
        subtopics: [...subtopicCounts.entries()]
          .map(([slug, value]) => ({ slug, ...value }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr")),
      };
    })
    // Most documented first: this block answers "where does this candidacy put the accent", and
    // alphabetical order would bury the answer. It is a count of OUR extraction, not a ranking of
    // candidacies against each other, which is why it is allowed here and not on the field.
    .sort((a, b) => b.measureCount - a.measureCount);

  return {
    themes,
    recentVotes: votes.map((v) => ({
      id: v.id,
      position: v.position,
      votingDate: v.votingDate,
      scrutinTitle: v.scrutin.title,
      scrutinId: v.scrutin.id,
    })),
    mandateCount: mandates.length,
    probityConvictionCount,
    probityNonDefinitiveConvictionCount,
  };
}

/**
 * Cached read for the politician fiche, carrying BOTH tags of the presidential surfaces.
 *
 * `election-candidacies` because the notice's state depends on `CandidacyPresidential`
 * publicationStatus through its measure counters, and `election-measures` because those counters
 * move on a measure publication. Omitting either would recreate the exact debt #678 paid off: the
 * four hub reads carried only the measures tag while the extension mutations purged `elections`, two
 * sets that do not overlap, so a DRAFT to PUBLISHED transition busted nothing and the surfaces
 * stayed closed for 24h with the data already in place.
 *
 * The election id is resolved first because both tags are keyed on it, and the slug alone cannot
 * name them.
 */
export async function getPoliticianPresidentialCandidacy(
  politicianId: string
): Promise<PoliticianCandidacy | null> {
  const election = await db.election.findUnique({
    where: { slug: PRESIDENTIELLE_2027_SLUG },
    select: { id: true },
  });
  if (election === null) return null;
  return getPoliticianPresidentialCandidacyCached(politicianId, election.id);
}

async function getPoliticianPresidentialCandidacyCached(
  politicianId: string,
  electionId: string
): Promise<PoliticianCandidacy | null> {
  "use cache";
  cacheTag(`election-measures:${electionId}`);
  cacheTag(`election-candidacies:${electionId}`);
  cacheLife("synced");
  return loadPoliticianPresidentialCandidacy(politicianId);
}

/**
 * Cached companion of the read above, same tags for the same reason: the themes and their quotes
 * move on a measure publication, and the candidacy's visibility on an extension transition. The
 * `votes` tag as well, since the last-votes block is invalidated by a scrutin import. The probity
 * counters make `affairs` another direct dependency of this read.
 */
export async function getCandidateFicheDetail(
  candidacyId: string,
  politicianId: string
): Promise<CandidateFicheDetail> {
  const election = await db.election.findUnique({
    where: { slug: PRESIDENTIELLE_2027_SLUG },
    select: { id: true },
  });
  if (election === null) {
    return {
      themes: [],
      recentVotes: [],
      mandateCount: 0,
      probityConvictionCount: 0,
      probityNonDefinitiveConvictionCount: 0,
    };
  }
  return getCandidateFicheDetailCached(candidacyId, politicianId, election.id);
}

async function getCandidateFicheDetailCached(
  candidacyId: string,
  politicianId: string,
  electionId: string
): Promise<CandidateFicheDetail> {
  "use cache";
  cacheTag(`election-measures:${electionId}`);
  cacheTag(`election-candidacies:${electionId}`);
  cacheTag("votes");
  cacheTag("affairs");
  cacheLife("synced");
  return loadCandidateFicheDetail(candidacyId, politicianId);
}
