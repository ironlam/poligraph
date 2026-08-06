import type { Prisma, ThemeCategory } from "@/generated/prisma";
import { db } from "@/lib/db";

/**
 * The two cumulative publication conditions, as a reusable predicate.
 *
 * publicationStatus alone is not enough, and that is the whole point: the second condition
 * is about the state of the revision the pointer designates. A measure can be PUBLISHED
 * while pointing at a revision that was never reviewed, never published, has been
 * superseded, or carries no source, and each of those must stay invisible.
 */
const PUBLIC_MEASURE_WHERE = {
  publicationStatus: "PUBLISHED",
  publishedRevisionId: { not: null },
  publishedRevision: {
    reviewedAt: { not: null },
    publishedAt: { not: null },
    supersededAt: null,
    discardedAt: null,
    sources: { some: {} },
  },
} satisfies Prisma.MeasureWhereInput;

const PUBLIC_MEASURE_INCLUDE = {
  publishedRevision: {
    include: {
      sources: { orderBy: { publishedAt: "asc" } },
      qualifications: { orderBy: { assessedAt: "desc" } },
    },
  },
} satisfies Prisma.MeasureInclude;

type MeasureRow = Prisma.MeasureGetPayload<{ include: typeof PUBLIC_MEASURE_INCLUDE }>;
type PublishedRevision = NonNullable<MeasureRow["publishedRevision"]>;

/**
 * The withdrawal state, as one object rather than three loose fields.
 *
 * Its PRESENCE is the fact that the candidate dropped the proposal, and that fact must
 * never be hidden: a page showing a withdrawn measure as if it were still defended is a
 * factual error, which is worse than a missing source label.
 *
 * That is why the two source fields are nullable inside a non-null object, which is the one
 * deviation from the shape asked for in review. withdrawMeasure() writes the three fields
 * together or none, so a partial state can only come from a direct database write, and the
 * audit reports it. Requiring both sources here would mean returning `withdrawal: null` on
 * such a row, which hides a real withdrawal to protect a type.
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
  /** The published revision this measure points at. Non-null here: the where clause requires it. */
  publishedRevisionId: string;
  text: string;
  precision: PublishedRevision["precision"];
  theme: MeasureRow["theme"];
  attribution: MeasureRow["attribution"];
  politicianId: string;
  candidacyId: string | null;
  withdrawal: MeasureWithdrawal | null;
  sources: PublishedRevision["sources"];
  qualifications: PublishedRevision["qualifications"];
};

function toPublicMeasure(row: MeasureRow): PublicMeasure | null {
  const revision = row.publishedRevision;
  // Defensive and not redundant with the where clause: this is the only place that turns a
  // nullable pointer into a non-nullable text, so the narrowing has to be here.
  if (!revision) return null;

  return {
    id: row.id,
    publishedRevisionId: revision.id,
    text: revision.text,
    precision: revision.precision,
    theme: row.theme,
    attribution: row.attribution,
    politicianId: row.politicianId,
    candidacyId: row.candidacyId,
    withdrawal: row.withdrawnAt
      ? {
          withdrawnAt: row.withdrawnAt,
          sourceUrl: row.withdrawnSourceUrl,
          sourceLabel: row.withdrawnSourceLabel,
        }
      : null,
    sources: revision.sources,
    qualifications: revision.qualifications,
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
        },
        orderBy: { validFrom: "desc" },
      },
    },
  });
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
