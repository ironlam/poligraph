import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { MAX_MEASURE_PUBLICATION_BATCH_SIZE } from "@/lib/measures/batch-publication";

const ELIGIBLE_MEASURE_WHERE = {
  publicationStatus: "DRAFT",
  publishedRevisionId: null,
  latestRevision: {
    is: {
      reviewedAt: { not: null },
      publishedAt: null,
      discardedAt: null,
      supersededAt: null,
      sources: { some: {} },
    },
  },
} satisfies Prisma.MeasureWhereInput;

export type BatchPublishItem = {
  measureId: string;
  revisionId: string;
  expectedUpdatedAt: string;
  text: string;
};

export type BatchPublishGroup = {
  programEditionId: string;
  editionLabel: string;
  editionVersion: number;
  ownerLabel: string;
  electionTitle: string;
  items: BatchPublishItem[];
  hasMore: boolean;
};

/**
 * Returns only first publications whose active revision was already reviewed. Corrections and
 * republications remain individual actions because replacing public text or reversing a legal
 * depublication requires a decision tied to that exact measure.
 */
export async function queryBatchPublishGroups(): Promise<BatchPublishGroup[]> {
  const editions = await db.programEdition.findMany({
    where: { measures: { some: ELIGIBLE_MEASURE_WHERE } },
    select: {
      id: true,
      label: true,
      version: true,
      candidacy: { select: { candidateName: true } },
      party: { select: { name: true } },
      election: { select: { title: true } },
      measures: {
        where: ELIGIBLE_MEASURE_WHERE,
        select: {
          id: true,
          updatedAt: true,
          latestRevision: { select: { id: true, text: true } },
        },
        orderBy: { createdAt: "asc" },
        take: MAX_MEASURE_PUBLICATION_BATCH_SIZE + 1,
      },
    },
    orderBy: [{ publishedAt: "asc" }, { version: "asc" }],
  });

  return editions.flatMap((edition) => {
    const items = edition.measures
      .slice(0, MAX_MEASURE_PUBLICATION_BATCH_SIZE)
      .flatMap((measure): BatchPublishItem[] => {
        if (measure.latestRevision === null) return [];
        return [
          {
            measureId: measure.id,
            revisionId: measure.latestRevision.id,
            expectedUpdatedAt: measure.updatedAt.toISOString(),
            text: measure.latestRevision.text,
          },
        ];
      });

    if (items.length === 0) return [];
    return [
      {
        programEditionId: edition.id,
        editionLabel: edition.label,
        editionVersion: edition.version,
        ownerLabel:
          edition.candidacy?.candidateName ?? edition.party?.name ?? "Propriétaire inconnu",
        electionTitle: edition.election.title,
        items,
        hasMore: edition.measures.length > MAX_MEASURE_PUBLICATION_BATCH_SIZE,
      },
    ];
  });
}
