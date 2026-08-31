import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { MAX_MEASURE_PUBLICATION_BATCH_SIZE } from "@/lib/measures/batch-publication";
import type { MeasureBatchKind } from "@/lib/measures/batch-kind";
import {
  buildFirstPublicationWhere,
  buildGeneratedContextCorrectionWhere,
} from "./batch-eligibility";

const FIRST_PUBLICATION_WHERE = buildFirstPublicationWhere("PUBLISH");
const GENERATED_CONTEXT_CORRECTION_WHERE = buildGeneratedContextCorrectionWhere("PUBLISH");

export type BatchPublishItem = {
  measureId: string;
  revisionId: string;
  expectedUpdatedAt: string;
  text: string;
  details: string | null;
  batchKind: MeasureBatchKind;
};

export type BatchPublishGroup = {
  programEditionId: string;
  editionLabel: string;
  editionVersion: number;
  ownerLabel: string;
  electionTitle: string;
  items: BatchPublishItem[];
  hasMore: boolean;
  batchKind: MeasureBatchKind;
  groupKey: string;
};

/**
 * Returns first publications and generated context corrections already reviewed. Corrections that
 * alter the public formulation and republications remain individual decisions.
 */
export async function queryBatchPublishGroups(
  filters: {
    candidacyId?: string;
  } = {}
): Promise<BatchPublishGroup[]> {
  const queryKind = (where: Prisma.MeasureWhereInput) => {
    const eligibleWhere = filters.candidacyId
      ? { ...where, candidacyId: filters.candidacyId }
      : where;
    return db.programEdition.findMany({
      where: {
        ...(filters.candidacyId ? { candidacyId: filters.candidacyId } : {}),
        measures: { some: eligibleWhere },
      },
      select: {
        id: true,
        label: true,
        version: true,
        candidacy: { select: { candidateName: true } },
        party: { select: { name: true } },
        election: { select: { title: true } },
        measures: {
          where: eligibleWhere,
          select: {
            id: true,
            updatedAt: true,
            publicationStatus: true,
            publishedRevision: { select: { text: true } },
            latestRevision: { select: { id: true, text: true, details: true } },
          },
          orderBy: { createdAt: "asc" },
          take: MAX_MEASURE_PUBLICATION_BATCH_SIZE + 1,
        },
      },
      orderBy: [{ publishedAt: "asc" }, { version: "asc" }],
    });
  };

  const [firstPublicationEditions, contextCorrectionEditions] = await Promise.all([
    queryKind(FIRST_PUBLICATION_WHERE),
    queryKind(GENERATED_CONTEXT_CORRECTION_WHERE),
  ]);

  const serialize = (
    editions: Awaited<ReturnType<typeof queryKind>>,
    batchKind: MeasureBatchKind
  ): BatchPublishGroup[] =>
    editions.flatMap((edition) => {
      const items = edition.measures.flatMap((measure): BatchPublishItem[] => {
        if (measure.latestRevision === null) return [];
        if (
          (batchKind === "FIRST_PUBLICATION" && measure.publicationStatus !== "DRAFT") ||
          (batchKind === "CONTEXT_CORRECTION" && measure.publicationStatus !== "PUBLISHED")
        ) {
          return [];
        }
        if (
          batchKind === "CONTEXT_CORRECTION" &&
          measure.latestRevision.text !== measure.publishedRevision?.text
        ) {
          return [];
        }
        return [
          {
            measureId: measure.id,
            revisionId: measure.latestRevision.id,
            expectedUpdatedAt: measure.updatedAt.toISOString(),
            text: measure.latestRevision.text,
            details: measure.latestRevision.details,
            batchKind,
          },
        ];
      });

      if (items.length === 0) return [];
      const kindItems = items.slice(0, MAX_MEASURE_PUBLICATION_BATCH_SIZE);
      return [
        {
          programEditionId: edition.id,
          editionLabel: edition.label,
          editionVersion: edition.version,
          ownerLabel:
            edition.candidacy?.candidateName ?? edition.party?.name ?? "Propriétaire inconnu",
          electionTitle: edition.election.title,
          items: kindItems,
          hasMore: items.length > MAX_MEASURE_PUBLICATION_BATCH_SIZE,
          batchKind,
          groupKey: `${edition.id}:${batchKind}`,
        },
      ];
    });

  return [
    ...serialize(firstPublicationEditions, "FIRST_PUBLICATION"),
    ...serialize(contextCorrectionEditions, "CONTEXT_CORRECTION"),
  ];
}
