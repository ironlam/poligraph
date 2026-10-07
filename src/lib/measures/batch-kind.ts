import type { MeasureExtractionMethod } from "@/generated/prisma";
import { MEASURE_CONTEXT_PROMPT_VERSION } from "@/lib/measures/context-provenance";
import { MeasureValidationError } from "@/lib/measures/errors";

export type MeasureBatchKind = "FIRST_PUBLICATION" | "CONTEXT_CORRECTION" | "TEXT_CORRECTION";

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
  // A human-written correction of the public formulation. It changes what readers see, so the
  // batch panels show the published text beside the correction; AI-assisted rewrites of the
  // formulation stay individual decisions.
  if (
    kind === "TEXT_CORRECTION" &&
    measure.publicationStatus === "PUBLISHED" &&
    measure.publishedRevision !== null &&
    revision.text !== measure.publishedRevision.text &&
    revision.extractionMethod === "MANUAL"
  ) {
    return;
  }
  throw new MeasureValidationError("Cette révision ne correspond pas au type de lot annoncé");
}
