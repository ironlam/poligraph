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
