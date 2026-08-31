import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import {
  PUBLIC_MEASURE_REVISION_WHERE,
  PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
} from "@/lib/presidentielle/publication";

const PRESIDENTIAL_ELECTION_SLUG = "presidentielle-2027";

export type MeasureEnrichmentCoverage = {
  total: number;
  withDetails: number;
  withPendingContextDrafts: number;
  withApprovedSubtopics: number;
  withQualifications: number;
  withVoteLinks: number;
  withSourceLocation: number;
  withHistory: number;
};

function publicMeasureWhere(): Prisma.MeasureWhereInput {
  return {
    election: { slug: PRESIDENTIAL_ELECTION_SLUG },
    ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
  };
}

function withPublishedRevision(
  condition: Prisma.MeasureRevisionWhereInput
): Prisma.MeasureWhereInput {
  return {
    ...publicMeasureWhere(),
    // Reapply the shared public revision gate because this condition replaces the relation
    // predicate carried by PUBLIC_PRESIDENTIAL_MEASURE_WHERE.
    publishedRevision: {
      is: {
        ...PUBLIC_MEASURE_REVISION_WHERE,
        ...condition,
      },
    },
  };
}

/** Exact coverage of the public presidential measure corpus, independent of queue pagination. */
export async function queryMeasureEnrichmentCoverage(): Promise<MeasureEnrichmentCoverage> {
  const base = publicMeasureWhere();

  const [
    total,
    withDetails,
    withPendingContextDrafts,
    withApprovedSubtopics,
    withQualifications,
    withVoteLinks,
    withSourceLocation,
    withHistory,
  ] = await Promise.all([
    db.measure.count({ where: base }),
    db.measure.count({ where: withPublishedRevision({ details: { not: null } }) }),
    db.measure.count({
      where: {
        ...withPublishedRevision({ details: null }),
        latestRevision: {
          is: {
            details: { not: null },
            extractionMethod: "AI_ASSISTED",
            extractorVersion: { contains: ":measure-context-" },
            publishedAt: null,
            discardedAt: null,
            rejectedAt: null,
          },
        },
      },
    }),
    db.measure.count({
      where: withPublishedRevision({
        subtopics: {
          some: { status: "APPROVED", subtopic: { active: true } },
        },
      }),
    }),
    db.measure.count({
      where: withPublishedRevision({ qualifications: { some: {} } }),
    }),
    db.measureRevision.count({
      where: {
        publishedOf: { is: base },
        applicableVoteLinks: { some: {} },
      },
    }),
    db.measure.count({
      where: withPublishedRevision({ sources: { some: { page: { not: null } } } }),
    }),
    db.measure.count({
      where: {
        ...base,
        OR: [{ precedingMeasureId: { not: null } }, { followingMeasures: { some: {} } }],
      },
    }),
  ]);

  return {
    total,
    withDetails,
    withPendingContextDrafts,
    withApprovedSubtopics,
    withQualifications,
    withVoteLinks,
    withSourceLocation,
    withHistory,
  };
}
