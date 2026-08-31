import type { Prisma, ThemeCategory } from "@/generated/prisma";
import {
  MEASURE_ATTRIBUTION_LABELS,
  MEASURE_PRECISION_LABELS,
  THEME_CATEGORY_LABELS,
} from "@/config/labels";
import { db } from "@/lib/db";
import { themeToSlug } from "@/lib/theme-utils";
import { getPublicTrackedPresidentialCandidacyWhere } from "./presidential-candidacy-policy";
import { PUBLIC_CANDIDACY_WHERE } from "./presidential-candidates-public";
import {
  getPublicPresidentialFicheWhere,
  PUBLIC_MEASURE_WHERE,
  PUBLIC_MEASURE_REVISION_WHERE,
} from "@/lib/presidentielle/publication";
import { isPresidentialTheme } from "@/lib/presidentielle/themes";

/**
 * The cumulative public measure predicate.
 *
 * publicationStatus alone is not enough. The designated revision must have reviewedAt and
 * publishedAt set, supersededAt, discardedAt and rejectedAt unset, and at least one source.
 * Every condition is required, so a measure pointing at an ineligible revision stays invisible.
 */
const PUBLIC_MEASURE_INCLUDE = {
  publishedRevision: {
    include: {
      sources: { orderBy: { publishedAt: "asc" } },
      qualifications: { orderBy: { assessedAt: "desc" } },
      subtopics: {
        where: { status: "APPROVED", subtopic: { active: true } },
        include: { subtopic: true },
        orderBy: { subtopic: { sortOrder: "asc" } },
      },
      readerGuideMentions: {
        where: {
          status: "APPROVED",
          guide: {
            is: {
              active: true,
              publicationStatus: "PUBLISHED",
              reviewedAt: { not: null },
            },
          },
        },
        include: { guide: true },
        orderBy: { guide: { label: "asc" } },
      },
    },
  },
} satisfies Prisma.MeasureInclude;

type MeasureRow = Prisma.MeasureGetPayload<{ include: typeof PUBLIC_MEASURE_INCLUDE }>;
type PublishedRevision = NonNullable<MeasureRow["publishedRevision"]>;

/**
 * The canonical withdrawal state. Its presence records that the candidate dropped the proposal.
 * Historical source fields remain independently nullable so partial provenance is never hidden.
 */
export type MeasureWithdrawal = {
  withdrawnAt: Date;
  sourceUrl: string | null;
  sourceLabel: string | null;
};

/**
 * What a public surface receives. `text` is non-nullable while Measure.publishedRevisionId
 * is nullable, and that narrowing is the whole point of this layer: a component must never
 * have to ask whether the revision it renders exists.
 */
export type PublicMeasure = {
  id: string;
  slug: string;
  /** The published revision this measure points at. Non-null here: the where clause requires it. */
  publishedRevisionId: string;
  text: string;
  /** Source-backed context published with the reviewed formulation, when available. */
  details: string | null;
  /** Date of the human review that authorized the published formulation. */
  reviewedAt: Date;
  precision: PublishedRevision["precision"];
  theme: MeasureRow["theme"];
  attribution: MeasureRow["attribution"];
  politicianId: string;
  candidacyId: string | null;
  /**
   * The programme edition this measure was extracted from, when there is one. Null means the
   * measure comes from a speech, an interview or an article, which the priorities page treats as
   * a different KIND of corpus, not merely a different source tier.
   */
  programEditionId: string | null;
  withdrawal: MeasureWithdrawal | null;
  sources: PublishedRevision["sources"];
  qualifications: PublishedRevision["qualifications"];
  subtopics: Array<{ slug: string; label: string }>;
  readerGuides: Array<{ slug: string; label: string; definition: string }>;
};

function toPublicMeasure(row: MeasureRow): PublicMeasure | null {
  const revision = row.publishedRevision;
  // Defensive and not redundant with the where clause: this is the only place that turns a
  // nullable pointer into a non-nullable text, so the narrowing has to be here.
  if (!revision) return null;

  return {
    id: row.id,
    slug: row.slug,
    publishedRevisionId: revision.id,
    text: revision.text,
    details: revision.details,
    reviewedAt: revision.reviewedAt!,
    precision: revision.precision,
    theme: row.theme,
    attribution: row.attribution,
    politicianId: row.politicianId,
    candidacyId: row.candidacyId,
    programEditionId: row.programEditionId,
    withdrawal: row.withdrawnAt
      ? {
          withdrawnAt: row.withdrawnAt,
          sourceUrl: row.withdrawnSourceUrl,
          sourceLabel: row.withdrawnSourceLabel,
        }
      : null,
    sources: revision.sources,
    qualifications: revision.qualifications,
    subtopics: revision.subtopics.map(({ subtopic }) => ({
      slug: subtopic.slug,
      label: subtopic.label,
    })),
    readerGuides: revision.readerGuideMentions.flatMap(({ guide }) =>
      guide ? [{ slug: guide.slug, label: guide.label, definition: guide.definition }] : []
    ),
  };
}

/**
 * Lists answer "which proposals are currently defended", so they exclude withdrawn
 * measures BY DEFAULT. A caller who forgets the option gets the safe answer; showing a
 * dropped proposal in a programme listing states something false about the candidate.
 *
 * Withdrawn measures stay reachable explicitly, for a history view. Detail reads never
 * filter on withdrawal at all.
 */
export type MeasureListOptions = { includeWithdrawn?: boolean };

function withdrawalFilter(options?: MeasureListOptions): Prisma.MeasureWhereInput {
  return options?.includeWithdrawn ? {} : { withdrawnAt: null };
}

const PUBLIC_PRESIDENTIAL_MEASURE_SELECT = {
  id: true,
  slug: true,
  publishedRevisionId: true,
  theme: true,
  attribution: true,
  withdrawnAt: true,
  withdrawnSourceUrl: true,
  withdrawnSourceLabel: true,
  publishedRevision: {
    select: {
      id: true,
      text: true,
      precision: true,
      sources: {
        select: {
          sourceKind: true,
          tier: true,
          url: true,
          page: true,
          publishedAt: true,
        },
        orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
      },
      subtopics: {
        where: { status: "APPROVED", subtopic: { active: true } },
        select: {
          subtopic: { select: { slug: true, label: true, theme: true, sortOrder: true } },
        },
        orderBy: { subtopic: { sortOrder: "asc" } },
      },
    },
  },
  candidacy: {
    select: {
      id: true,
      candidateName: true,
      politician: { select: { slug: true } },
    },
  },
} satisfies Prisma.MeasureSelect;

type PublicPresidentialMeasureRow = Prisma.MeasureGetPayload<{
  select: typeof PUBLIC_PRESIDENTIAL_MEASURE_SELECT;
}>;

export type PublicPresidentialMeasure = {
  measureId: string;
  slug: string;
  publicUrl: string;
  publishedRevisionId: string;
  text: string;
  precision: {
    code: NonNullable<PublicPresidentialMeasureRow["publishedRevision"]>["precision"];
    label: string | null;
  };
  theme: { code: ThemeCategory; label: string; slug: string; publicUrl: string };
  attribution: { code: PublicPresidentialMeasureRow["attribution"]; label: string };
  candidacy: {
    candidacyId: string;
    candidateName: string;
    politicianSlug: string | null;
    publicUrl: string | null;
  };
  sources: NonNullable<PublicPresidentialMeasureRow["publishedRevision"]>["sources"];
  subtopics: Array<{ slug: string; label: string }>;
  withdrawal: MeasureWithdrawal | null;
};

export type ListPublicPresidentialMeasuresOptions = {
  electionId: string;
  electionSlug: string;
  candidateSlug?: string;
  theme?: ThemeCategory;
  subtopicSlug?: string;
  query?: string;
  includeWithdrawn?: boolean;
  page: number;
  limit: number;
};

export type PublicPresidentialMeasurePage = {
  data: PublicPresidentialMeasure[];
  total: number;
};

function toPublicPresidentialMeasure(
  row: PublicPresidentialMeasureRow,
  electionSlug: string
): PublicPresidentialMeasure | null {
  const revision = row.publishedRevision;
  const candidacy = row.candidacy;
  if (revision === null || row.publishedRevisionId === null || candidacy === null) return null;

  const politicianSlug = candidacy.politician?.slug ?? null;
  const themeSlug = themeToSlug(row.theme);
  return {
    measureId: row.id,
    slug: row.slug,
    publicUrl: `/elections/${electionSlug}/mesures/${row.slug}`,
    publishedRevisionId: row.publishedRevisionId,
    text: revision.text,
    precision: {
      code: revision.precision,
      label: revision.precision ? MEASURE_PRECISION_LABELS[revision.precision] : null,
    },
    theme: {
      code: row.theme,
      label: THEME_CATEGORY_LABELS[row.theme],
      slug: themeSlug,
      publicUrl: `/elections/${electionSlug}/themes/${themeSlug}`,
    },
    attribution: {
      code: row.attribution,
      label: MEASURE_ATTRIBUTION_LABELS[row.attribution],
    },
    candidacy: {
      candidacyId: candidacy.id,
      candidateName: candidacy.candidateName,
      politicianSlug,
      publicUrl: politicianSlug ? `/elections/${electionSlug}/candidats/${politicianSlug}` : null,
    },
    sources: revision.sources,
    subtopics: revision.subtopics.map(({ subtopic }) => ({
      slug: subtopic.slug,
      label: subtopic.label,
    })),
    withdrawal:
      row.withdrawnAt !== null
        ? {
            withdrawnAt: row.withdrawnAt,
            sourceUrl: row.withdrawnSourceUrl,
            sourceLabel: row.withdrawnSourceLabel,
          }
        : null,
  };
}

/**
 * Database-paginated public read for presidential measures.
 *
 * The measure/revision gate and the published presidential-candidacy gate are cumulative. Neither
 * a PUBLISHED measure alone nor a PUBLISHED candidacy extension alone can surface a row.
 */
export async function listPublicPresidentialMeasures(
  options: ListPublicPresidentialMeasuresOptions
): Promise<PublicPresidentialMeasurePage> {
  const candidacyWhere: Prisma.CandidacyWhereInput = options.includeWithdrawn
    ? {
        ...getPublicTrackedPresidentialCandidacyWhere(options.candidateSlug),
        ...PUBLIC_CANDIDACY_WHERE,
      }
    : getPublicPresidentialFicheWhere(options.candidateSlug);
  const where: Prisma.MeasureWhereInput = {
    electionId: options.electionId,
    ...(options.theme ? { theme: options.theme } : {}),
    ...PUBLIC_MEASURE_WHERE,
    ...(options.query || options.subtopicSlug
      ? {
          publishedRevision: {
            is: {
              ...PUBLIC_MEASURE_REVISION_WHERE,
              ...(options.query
                ? {
                    OR: [
                      { text: { contains: options.query, mode: "insensitive" as const } },
                      { details: { contains: options.query, mode: "insensitive" as const } },
                    ],
                  }
                : {}),
              ...(options.subtopicSlug
                ? {
                    subtopics: {
                      some: {
                        status: "APPROVED",
                        subtopic: { slug: options.subtopicSlug, active: true },
                      },
                    },
                  }
                : {}),
            },
          },
        }
      : {}),
    ...withdrawalFilter(options),
    candidacy: { is: candidacyWhere },
  };

  const [total, rows] = await Promise.all([
    db.measure.count({ where }),
    db.measure.findMany({
      where,
      select: PUBLIC_PRESIDENTIAL_MEASURE_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (options.page - 1) * options.limit,
      take: options.limit,
    }),
  ]);

  return {
    total,
    data: rows
      .map((row) => toPublicPresidentialMeasure(row, options.electionSlug))
      .filter((measure): measure is PublicPresidentialMeasure => measure !== null),
  };
}

export type PublicMeasureSubtopicCount = {
  slug: string;
  label: string;
  theme: ThemeCategory;
  count: number;
};

/** Only human-approved assignments attached to the currently published revision. */
export async function getPublicMeasureSubtopicCountsByCandidacy(
  candidacyId: string,
  theme?: ThemeCategory
): Promise<PublicMeasureSubtopicCount[]> {
  const rows = await db.measureRevisionSubtopic.findMany({
    where: {
      status: "APPROVED",
      subtopic: { active: true, ...(theme ? { theme } : {}) },
      revision: {
        publishedOf: {
          is: {
            candidacyId,
            ...PUBLIC_MEASURE_WHERE,
            withdrawnAt: null,
          },
        },
      },
    },
    select: { subtopic: { select: { slug: true, label: true, theme: true, sortOrder: true } } },
  });
  const counts = new Map<string, PublicMeasureSubtopicCount & { sortOrder: number }>();
  for (const row of rows) {
    const current = counts.get(row.subtopic.slug);
    counts.set(row.subtopic.slug, {
      slug: row.subtopic.slug,
      label: row.subtopic.label,
      theme: row.subtopic.theme,
      sortOrder: row.subtopic.sortOrder,
      count: (current?.count ?? 0) + 1,
    });
  }
  return [...counts.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "fr"))
    .map(({ sortOrder: _sortOrder, ...item }) => item);
}

/**
 * Detail read. Includes withdrawn measures on purpose: erasing a proposal a candidate
 * publicly carried and then dropped would delete information that matters, and the page
 * displays the withdrawal instead of hiding the row.
 */
export async function getPublicMeasure(measureId: string): Promise<PublicMeasure | null> {
  const row = await db.measure.findFirst({
    where: { id: measureId, ...PUBLIC_MEASURE_WHERE },
    include: PUBLIC_MEASURE_INCLUDE,
  });
  return row ? toPublicMeasure(row) : null;
}

export async function getPublicMeasuresByElection(
  electionId: string,
  options?: MeasureListOptions
): Promise<PublicMeasure[]> {
  const rows = await db.measure.findMany({
    where: { electionId, ...PUBLIC_MEASURE_WHERE, ...withdrawalFilter(options) },
    include: PUBLIC_MEASURE_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toPublicMeasure).filter((m): m is PublicMeasure => m !== null);
}

export async function getPublicMeasuresByTheme(
  electionId: string,
  theme: ThemeCategory,
  options?: MeasureListOptions
): Promise<PublicMeasure[]> {
  const rows = await db.measure.findMany({
    where: { electionId, theme, ...PUBLIC_MEASURE_WHERE, ...withdrawalFilter(options) },
    include: PUBLIC_MEASURE_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toPublicMeasure).filter((m): m is PublicMeasure => m !== null);
}

/**
 * Every publicly visible measure of one candidacy, for its fiche.
 *
 * Same visibility rule as the two reads above, scoped to a candidacy instead of an election or a
 * theme. Withdrawals are excluded by default here as everywhere: a fiche stating what a candidacy
 * proposes should not count a proposal it has dropped.
 */
export async function getPublicMeasuresByCandidacy(
  candidacyId: string,
  options?: MeasureListOptions
): Promise<PublicMeasure[]> {
  const rows = await db.measure.findMany({
    where: { candidacyId, ...PUBLIC_MEASURE_WHERE, ...withdrawalFilter(options) },
    include: PUBLIC_MEASURE_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toPublicMeasure).filter((m): m is PublicMeasure => m !== null);
}

/**
 * Moderation read. Applies NO filter, on purpose: the admin has to see drafts, discarded
 * revisions and depublished measures, which is the whole reason the public and moderation
 * reads are two different functions in the same file.
 */
export async function getMeasureForModeration(measureId: string) {
  return db.measure.findUnique({
    where: { id: measureId },
    include: {
      revisions: {
        include: {
          sources: true,
          qualifications: true,
          assessments: { include: { matches: true } },
          subtopics: {
            include: { subtopic: true },
            orderBy: [{ status: "asc" }, { subtopic: { sortOrder: "asc" } }],
          },
          readerGuideMentions: {
            include: { guide: true },
            orderBy: [{ status: "asc" }, { proposedAt: "asc" }],
          },
        },
        orderBy: { validFrom: "desc" },
      },
    },
  });
}

/**
 * Hub stat 4.3: when the most recently reviewed public measure was reviewed, on an
 * election and optionally narrowed to one theme.
 *
 * Orders on `publishedRevision.reviewedAt`, which PUBLIC_MEASURE_WHERE already requires to
 * be non-null on every row this can select: a depublished or discarded measure can carry a
 * later reviewedAt on its (former) published revision, and reusing the predicate rather than
 * a hand-rolled one is what keeps it out.
 */
export async function getLatestPublicReviewDate(
  electionId: string,
  theme?: ThemeCategory
): Promise<Date | null> {
  const row = await db.measure.findFirst({
    where: { electionId, ...(theme ? { theme } : {}), ...PUBLIC_MEASURE_WHERE },
    orderBy: { publishedRevision: { reviewedAt: "desc" } },
    select: { publishedRevision: { select: { reviewedAt: true } } },
  });
  return row?.publishedRevision?.reviewedAt ?? null;
}

/**
 * The same date, narrowed to the population the presidential surfaces can actually render.
 *
 * `getLatestPublicReviewDate` answers "the last reviewed public measure of this election", which is
 * the right question for a generic election page and the wrong one for the hub: the hub already
 * derives `verifiedMeasureCount` from candidacies whose `CandidacyPresidential` is PUBLISHED, so
 * pairing it with a date drawn from a wider set states that a measure was reviewed on a day when
 * nothing the reader can reach was. Two measures escape the hub's own count and used to move its
 * date: one attached to a DRAFT extension, and one attached to no candidacy at all.
 *
 * Composed from the two existing predicates rather than a third hand-rolled one. Duplicating
 * PUBLIC_MEASURE_WHERE is exactly how the count and the date drifted apart in the first place.
 */
export async function getLatestPresidentialReviewDate(
  electionId: string,
  theme?: ThemeCategory
): Promise<Date | null> {
  const row = await db.measure.findFirst({
    where: {
      electionId,
      ...(theme ? { theme } : {}),
      ...PUBLIC_MEASURE_WHERE,
      // `is` and not a bare object: it also excludes measures with candidacyId null, which have no
      // column on any comparison and must not carry the date either.
      candidacy: { is: PUBLIC_CANDIDACY_WHERE },
    },
    orderBy: { publishedRevision: { reviewedAt: "desc" } },
    select: { publishedRevision: { select: { reviewedAt: true } } },
  });
  return row?.publishedRevision?.reviewedAt ?? null;
}

/**
 * Counters for ONE candidacy, without loading a single measure.
 *
 * Lives here and not on the calling page because `PUBLIC_MEASURE_WHERE` is private to this file and
 * this module's doctrine is that no page reads `db.measure.*`.
 *
 * Composed from the two existing predicates, like `getLatestPresidentialReviewDate` above and for
 * the same reason: a third hand-rolled copy of the publishable population is how the hub's count
 * and its review date drifted apart.
 *
 * The PRIMARY-source condition is expressed on `publishedRevision`, never as a join over the
 * measure's revisions. A draft revision that nobody published must not make its measure count as
 * primary-sourced: these numbers feed `isFicheCandidatPublishable()`, so a looser predicate would
 * open a candidate fiche on the strength of unpublished work.
 */
export type PublicMeasureStats = {
  measureCount: number;
  themesCoveredCount: number;
  primarySourceMeasureCount: number;
  lastReviewedAt: Date | null;
  /**
   * When the OLDEST measure the candidacy currently shows was published. Null when it shows none.
   *
   * The one date that answers "did this candidacy have a programme on day X", which is what
   * `isSynthesisContradictedByMeasures` needs and what `lastReviewedAt` cannot say: a candidacy
   * documented for months and reviewed again yesterday has the same `lastReviewedAt` as one whose
   * whole programme landed yesterday.
   */
  firstPublishedAt: Date | null;
};

export async function getPublicMeasureStatsByCandidacy(
  candidacyId: string
): Promise<PublicMeasureStats> {
  const scope: Prisma.MeasureWhereInput = {
    candidacyId,
    // `is` and not a bare object, as in getLatestPresidentialReviewDate: it also rules out a
    // candidacy row that has no presidential extension at all.
    candidacy: { is: PUBLIC_CANDIDACY_WHERE },
    withdrawnAt: null,
    ...PUBLIC_MEASURE_WHERE,
  };

  const [byTheme, primarySourceMeasureCount, lastReviewed, firstPublished] = await Promise.all([
    db.measure.groupBy({ by: ["theme"], where: scope, _count: { _all: true } }),
    db.measure.count({
      where: {
        ...scope,
        publishedRevision: {
          ...PUBLIC_MEASURE_REVISION_WHERE,
          sources: { some: { tier: "PRIMARY" } },
        },
      },
    }),
    db.measure.findFirst({
      where: scope,
      orderBy: { publishedRevision: { reviewedAt: "desc" } },
      select: { publishedRevision: { select: { reviewedAt: true } } },
    }),
    // Same scope, opposite end. Ordering on the revision's `publishedAt` and not on the measure's
    // `createdAt`: a measure can be extracted in March and published in August, and the question
    // this answers is when the fiche started SHOWING something, not when we started working on it.
    db.measure.findFirst({
      where: scope,
      orderBy: { publishedRevision: { publishedAt: "asc" } },
      select: { publishedRevision: { select: { publishedAt: true } } },
    }),
  ]);

  return {
    measureCount: byTheme.reduce((n, row) => n + row._count._all, 0),
    themesCoveredCount: byTheme.filter((row) => isPresidentialTheme(row.theme)).length,
    primarySourceMeasureCount,
    lastReviewedAt: lastReviewed?.publishedRevision?.reviewedAt ?? null,
    firstPublishedAt: firstPublished?.publishedRevision?.publishedAt ?? null,
  };
}

/**
 * The same measure population as the public reads, for a set of candidacies, WITHOUT the
 * `PUBLIC_CANDIDACY_WHERE` gate.
 *
 * It answers the one question the public reads cannot: how many measures WOULD become visible if
 * the candidacy's editorial extension were published. `getPublicMeasureStatsByCandidacy` returns
 * zero on a DRAFT extension, which is correct for a page and useless for the moderator deciding
 * whether to publish it: the whole point of the admin screen is to see the measures the gate is
 * currently holding back.
 *
 * The measure-level conditions are NOT rewritten here, they are `PUBLIC_MEASURE_WHERE` plus the
 * withdrawal filter. A hand-rolled copy is how the hub's count and its review date drifted apart
 * (see `getLatestPresidentialReviewDate`), and here it would announce a number the fiche does not
 * honour once published.
 *
 * One grouped query for the whole page rather than one read per row: the candidates screen lists
 * every candidacy of the election, and a per-row read turns it into thirty round trips.
 */
export type CandidacyMeasureReadiness = {
  measureCount: number;
  themesCoveredCount: number;
  primarySourceMeasureCount: number;
  /**
   * When the OLDEST of those measures was published. Null when there are none.
   *
   * The admin counterpart of `PublicMeasureStats.firstPublishedAt`, and it answers the same
   * question `isSynthesisContradictedByMeasures` asks: would the fiche still display the stored
   * synthesis. Read WITHOUT the candidacy gate like the rest of this shape, which is the useful
   * reading for the screen it feeds: a moderator about to publish an extension needs to know
   * whether the synthesis will survive that publication, and gating the date on the extension
   * would answer "no measure, so nothing contradicts it" right up until the moment it does.
   */
  firstPublishedAt: Date | null;
};

export const EMPTY_MEASURE_READINESS: CandidacyMeasureReadiness = {
  measureCount: 0,
  themesCoveredCount: 0,
  primarySourceMeasureCount: 0,
  firstPublishedAt: null,
};

/**
 * How many candidacies hold publishable measures behind a closed extension.
 *
 * The badge of the candidates screen, and the reason this file owns the count: the predicate is
 * the negation of `PUBLIC_CANDIDACY_WHERE` applied to the population `PUBLIC_MEASURE_WHERE`
 * describes, and neither belongs on a route handler. `NOT` on the public gate also catches a
 * candidacy with no extension row at all, which is the state twelve of them are in.
 */
export async function countCandidaciesHoldingBackMeasures(): Promise<number> {
  return db.candidacy.count({
    where: {
      NOT: PUBLIC_CANDIDACY_WHERE,
      measures: { some: { withdrawnAt: null, ...PUBLIC_MEASURE_WHERE } },
    },
  });
}

export async function getMeasureReadinessByCandidacies(
  candidacyIds: string[]
): Promise<Map<string, CandidacyMeasureReadiness>> {
  const readiness = new Map<string, CandidacyMeasureReadiness>();
  if (candidacyIds.length === 0) return readiness;

  const scope: Prisma.MeasureWhereInput = {
    candidacyId: { in: candidacyIds },
    withdrawnAt: null,
    ...PUBLIC_MEASURE_WHERE,
  };

  const [byTheme, byPrimarySource, publications] = await Promise.all([
    db.measure.groupBy({ by: ["candidacyId", "theme"], where: scope, _count: { _all: true } }),
    db.measure.groupBy({
      by: ["candidacyId"],
      where: {
        ...scope,
        publishedRevision: {
          is: {
            ...PUBLIC_MEASURE_REVISION_WHERE,
            sources: { some: { tier: "PRIMARY" } },
          },
        },
      },
      _count: { _all: true },
    }),
    // Rows rather than an aggregate: the date lives on the published REVISION, and Prisma's
    // `groupBy` aggregates columns of the model it groups, not of a relation. Two scalars per
    // measure, for a field that holds a few hundred, on an admin screen.
    db.measure.findMany({
      where: scope,
      select: { candidacyId: true, publishedRevision: { select: { publishedAt: true } } },
    }),
  ]);

  for (const row of byTheme) {
    if (row.candidacyId === null) continue;
    const current = readiness.get(row.candidacyId) ?? { ...EMPTY_MEASURE_READINESS };
    current.measureCount += row._count._all;
    if (isPresidentialTheme(row.theme)) current.themesCoveredCount += 1;
    readiness.set(row.candidacyId, current);
  }
  for (const row of byPrimarySource) {
    if (row.candidacyId === null) continue;
    const current = readiness.get(row.candidacyId) ?? { ...EMPTY_MEASURE_READINESS };
    current.primarySourceMeasureCount = row._count._all;
    readiness.set(row.candidacyId, current);
  }
  for (const row of publications) {
    const publishedAt = row.publishedRevision?.publishedAt;
    if (row.candidacyId === null || !publishedAt) continue;
    const current = readiness.get(row.candidacyId) ?? { ...EMPTY_MEASURE_READINESS };
    if (current.firstPublishedAt === null || publishedAt < current.firstPublishedAt) {
      current.firstPublishedAt = publishedAt;
    }
    readiness.set(row.candidacyId, current);
  }

  return readiness;
}

/**
 * The revision publicly in force on a given day. The condition on publishedAt is not
 * optional: without it the query can select a draft that was never published, and make the
 * site report a text it never displayed.
 */
export async function getRevisionInForceAt(
  measureId: string,
  at: Date
): Promise<{ id: string; text: string } | null> {
  const rows = await db.measureRevision.findMany({
    where: {
      measureId,
      publishedAt: { not: null, lte: at },
      validFrom: { lte: at },
      OR: [{ supersededAt: null }, { supersededAt: { gt: at } }],
    },
    orderBy: { validFrom: "desc" },
    take: 1,
    select: { id: true, text: true },
  });
  return rows[0] ?? null;
}
