import { db } from "@/lib/db";
import { invalidateMeasureTags } from "./cache";
import { MeasureValidationError } from "./errors";
import { lockMeasure } from "./lock";
import { EXCERPT_SOURCE_KINDS, validateExcerpt } from "./source-excerpt-rules";

/**
 * Writes the excerpt of one source of a PUBLISHED revision. It touches this column and nothing
 * else: no new revision, no text, no sub-topic, no reader guide. The excerpt is a quotation of the
 * document, not a claim of Poligraph, which is why it needs no review cycle of its own, and why the
 * write is traced in the audit log instead.
 */
export async function setSourceExcerpt(input: {
  sourceId: string;
  /** Null removes the excerpt. */
  excerpt: string | null;
  setBy: string;
}): Promise<void> {
  if (input.setBy.trim() === "") {
    throw new MeasureValidationError("Le responsable de l'extrait doit être identifié");
  }
  const clean = input.excerpt === null ? null : validateExcerpt(input.excerpt);
  if (clean && clean.errors.length > 0) throw new MeasureValidationError(clean.errors.join(" ; "));

  const source = await db.measureSource.findUniqueOrThrow({
    where: { id: input.sourceId },
    select: {
      id: true,
      sourceKind: true,
      excerpt: true,
      measureRevision: {
        select: {
          measureId: true,
          id: true,
          measure: { select: { electionId: true, publishedRevisionId: true } },
        },
      },
    },
  });
  const { measureId, measure } = source.measureRevision;
  if (measure.publishedRevisionId !== source.measureRevision.id) {
    throw new MeasureValidationError("L'extrait ne s'écrit que sur la révision publiée");
  }
  if (clean && !(EXCERPT_SOURCE_KINDS as readonly string[]).includes(source.sourceKind)) {
    throw new MeasureValidationError(
      "Un extrait ne s'écrit que sur un document écrit, pas sur un discours, la presse ou une vidéo"
    );
  }

  await db.$transaction(async (tx) => {
    await lockMeasure(tx, measureId);
    await tx.measureSource.update({
      where: { id: source.id },
      data: { excerpt: clean?.excerpt ?? null },
    });
    await tx.auditLog.create({
      data: {
        action: "SET_SOURCE_EXCERPT",
        entityType: "MeasureSource",
        entityId: source.id,
        changes: { measureId, from: source.excerpt, to: clean?.excerpt ?? null },
        userId: input.setBy,
      },
    });
  });
  invalidateMeasureTags(measureId, measure.electionId);
}
