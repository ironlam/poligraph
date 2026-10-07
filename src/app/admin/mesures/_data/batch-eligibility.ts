import type { Prisma } from "@/generated/prisma";
import { MEASURE_CONTEXT_PROMPT_VERSION } from "@/lib/measures/context-provenance";

type BatchStage = "REVIEW" | "PUBLISH";

export function buildFirstPublicationWhere(stage: BatchStage): Prisma.MeasureWhereInput {
  return {
    publicationStatus: "DRAFT",
    publishedRevisionId: null,
    latestRevision: {
      is: {
        reviewedAt: stage === "REVIEW" ? null : { not: null },
        publishedAt: null,
        discardedAt: null,
        supersededAt: null,
        rejectedAt: null,
        sources: { some: {} },
      },
    },
  };
}

/**
 * Manual corrections of a published measure. Prisma cannot compare the two revisions' texts, so
 * the queries keep only rows whose formulation actually changed, and the transition re-checks it
 * under lock through assertMeasureBatchKind.
 */
export function buildManualTextCorrectionWhere(stage: BatchStage): Prisma.MeasureWhereInput {
  return {
    publicationStatus: "PUBLISHED",
    publishedRevision: {
      is: {
        reviewedAt: { not: null },
        publishedAt: { not: null },
        supersededAt: null,
        discardedAt: null,
        rejectedAt: null,
      },
    },
    latestRevision: {
      is: {
        extractionMethod: "MANUAL",
        reviewedAt: stage === "REVIEW" ? null : { not: null },
        publishedAt: null,
        discardedAt: null,
        supersededAt: null,
        rejectedAt: null,
        sources: { some: {} },
      },
    },
  };
}

export function buildGeneratedContextCorrectionWhere(stage: BatchStage): Prisma.MeasureWhereInput {
  return {
    publicationStatus: "PUBLISHED",
    publishedRevision: {
      is: {
        reviewedAt: { not: null },
        publishedAt: { not: null },
        supersededAt: null,
        discardedAt: null,
        rejectedAt: null,
      },
    },
    latestRevision: {
      is: {
        details: { not: null },
        extractionMethod: "AI_ASSISTED",
        extractorVersion: { endsWith: `:${MEASURE_CONTEXT_PROMPT_VERSION}` },
        reviewedAt: stage === "REVIEW" ? null : { not: null },
        publishedAt: null,
        discardedAt: null,
        supersededAt: null,
        rejectedAt: null,
        sources: { some: {} },
      },
    },
  };
}
