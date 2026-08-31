import type { MeasureExtractionMethod } from "@/generated/prisma";
import { MEASURE_CONTEXT_PROMPT_VERSION } from "@/lib/measures/context-provenance";
import { MeasureValidationError } from "@/lib/measures/errors";

export type MeasureBatchKind = "FIRST_PUBLICATION" | "CONTEXT_CORRECTION";

export function assertMeasureBatchKind(
  kind: MeasureBatchKind | undefined,
  measure: {
    publicationStatus: string;
    publishedRevisionId: string | null;
    publishedRevision: { text: string } | null;
  },
  revision: {
    text: string;
    details: string | null;
    extractionMethod: MeasureExtractionMethod;
    extractorVersion: string | null;
  }
): void {
  if (kind === undefined) return;
  if (
    kind === "FIRST_PUBLICATION" &&
    measure.publicationStatus === "DRAFT" &&
    measure.publishedRevisionId === null
  ) {
    return;
  }
  if (
    kind === "CONTEXT_CORRECTION" &&
    measure.publicationStatus === "PUBLISHED" &&
    measure.publishedRevision !== null &&
    revision.text === measure.publishedRevision.text &&
    revision.details?.trim() &&
    revision.extractionMethod === "AI_ASSISTED" &&
    revision.extractorVersion?.endsWith(`:${MEASURE_CONTEXT_PROMPT_VERSION}`)
  ) {
    return;
  }
  throw new MeasureValidationError("Cette révision ne correspond pas au type de lot annoncé");
}
