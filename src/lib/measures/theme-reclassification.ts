import type { PublicationStatus, ThemeCategory } from "@/generated/prisma";
import { db } from "@/lib/db";
import { invalidateMeasureTags } from "@/lib/measures/cache";
import { MeasureConcurrencyError, MeasureValidationError } from "@/lib/measures/errors";
import { lockMeasure } from "@/lib/measures/lock";
import { syncSearchDocument } from "@/lib/measures/search-sync";
import { isAllowedPresidentialMeasureTheme } from "@/lib/presidentielle/themes";

export const MAX_THEME_RECLASSIFICATION_BATCH_SIZE = 100;

export type ThemeReclassificationEvidence = {
  classifierVersion: string;
  taxonomyVersion: string;
  reportHash: string;
  confidence: number;
  rationale: string;
};

export type ReclassifyMeasureThemeInput = {
  measureId: string;
  targetTheme: ThemeCategory;
  expectedUpdatedAt?: Date;
  reclassifiedBy: string;
  evidence: ThemeReclassificationEvidence;
};

export type ThemeReclassificationResult = {
  measureId: string;
  previousTheme: ThemeCategory;
  targetTheme: ThemeCategory;
  publicationStatus: PublicationStatus;
  changed: boolean;
  removedSubtopicAssignments: number;
};

function assertEvidenceIsValid(evidence: ThemeReclassificationEvidence): void {
  if (!/^[a-f0-9]{64}$/.test(evidence.reportHash)) {
    throw new MeasureValidationError("La requalification exige un hash de rapport SHA-256");
  }
  if (!Number.isFinite(evidence.confidence) || evidence.confidence < 0 || evidence.confidence > 1) {
    throw new MeasureValidationError(
      "La confiance de requalification doit être comprise entre 0 et 1"
    );
  }
  if (evidence.classifierVersion.trim() === "" || evidence.taxonomyVersion.trim() === "") {
    throw new MeasureValidationError(
      "La requalification exige les versions du classificateur et de la taxonomie"
    );
  }
  if (evidence.rationale.trim() === "") {
    throw new MeasureValidationError("La requalification exige une justification");
  }
}

/**
 * Changes only the controlled theme carried by a Measure.
 *
 * Publication pointers, revisions, sources and publication status are deliberately absent from
 * every write below. Incompatible subtopic assignments are removed because retaining them would
 * expose a classification outside the new theme; their complete former state remains in AuditLog.
 */
export async function reclassifyMeasureTheme(
  input: ReclassifyMeasureThemeInput
): Promise<ThemeReclassificationResult> {
  if (input.reclassifiedBy.trim() === "") {
    throw new MeasureValidationError("L'auteur de la requalification est obligatoire");
  }
  assertEvidenceIsValid(input.evidence);

  const result = await db.$transaction(async (tx) => {
    await lockMeasure(tx, input.measureId);

    const measure = await tx.measure.findUnique({
      where: { id: input.measureId },
      select: {
        id: true,
        theme: true,
        publicationStatus: true,
        electionId: true,
        updatedAt: true,
        election: { select: { slug: true } },
        revisions: {
          select: {
            id: true,
            subtopics: {
              select: {
                status: true,
                subtopicId: true,
                subtopic: { select: { slug: true, theme: true } },
              },
            },
          },
        },
      },
    });
    if (!measure) throw new MeasureValidationError("Mesure introuvable");

    if (
      input.expectedUpdatedAt &&
      measure.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
    ) {
      throw new MeasureConcurrencyError(
        input.measureId,
        input.expectedUpdatedAt,
        measure.updatedAt
      );
    }
    if (!isAllowedPresidentialMeasureTheme(measure.election.slug, input.targetTheme)) {
      throw new MeasureValidationError("Ce thème n'est pas autorisé pour cette élection");
    }

    if (measure.theme === input.targetTheme) {
      return {
        measureId: measure.id,
        previousTheme: measure.theme,
        targetTheme: input.targetTheme,
        publicationStatus: measure.publicationStatus,
        electionId: measure.electionId,
        changed: false,
        removedSubtopicAssignments: 0,
      };
    }

    const incompatibleAssignments = measure.revisions.flatMap((revision) =>
      revision.subtopics
        .filter((assignment) => assignment.subtopic.theme !== input.targetTheme)
        .map((assignment) => ({
          revisionId: revision.id,
          subtopicId: assignment.subtopicId,
          slug: assignment.subtopic.slug,
          theme: assignment.subtopic.theme,
          status: assignment.status,
        }))
    );

    if (incompatibleAssignments.length > 0) {
      await tx.measureRevisionSubtopic.deleteMany({
        where: {
          OR: incompatibleAssignments.map((assignment) => ({
            revisionId: assignment.revisionId,
            subtopicId: assignment.subtopicId,
          })),
        },
      });
    }

    await tx.measure.update({
      where: { id: measure.id },
      data: { theme: input.targetTheme },
    });
    await tx.auditLog.create({
      data: {
        action: "RECLASSIFY_MEASURE_THEME",
        entityType: "Measure",
        entityId: measure.id,
        userId: input.reclassifiedBy,
        changes: {
          previousTheme: measure.theme,
          targetTheme: input.targetTheme,
          publicationStatus: measure.publicationStatus,
          removedSubtopicAssignments: incompatibleAssignments,
          classifierVersion: input.evidence.classifierVersion,
          taxonomyVersion: input.evidence.taxonomyVersion,
          reportHash: input.evidence.reportHash,
          confidence: input.evidence.confidence,
          rationale: input.evidence.rationale,
        },
      },
    });
    await syncSearchDocument(tx, measure.id);

    return {
      measureId: measure.id,
      previousTheme: measure.theme,
      targetTheme: input.targetTheme,
      publicationStatus: measure.publicationStatus,
      electionId: measure.electionId,
      changed: true,
      removedSubtopicAssignments: incompatibleAssignments.length,
    };
  });

  if (result.changed) invalidateMeasureTags(result.measureId, result.electionId);
  const { electionId: _electionId, ...publicResult } = result;
  return publicResult;
}

export type ThemeReclassificationBatchFailure = {
  measureId: string;
  message: string;
  stale: boolean;
};

export async function reclassifyMeasureThemeBatch(inputs: ReclassifyMeasureThemeInput[]): Promise<{
  changedCount: number;
  unchangedCount: number;
  failures: ThemeReclassificationBatchFailure[];
}> {
  if (inputs.length < 1 || inputs.length > MAX_THEME_RECLASSIFICATION_BATCH_SIZE) {
    throw new MeasureValidationError(
      `Le lot doit contenir entre 1 et ${MAX_THEME_RECLASSIFICATION_BATCH_SIZE} mesures`
    );
  }
  if (new Set(inputs.map((input) => input.measureId)).size !== inputs.length) {
    throw new MeasureValidationError("Le lot contient plusieurs décisions pour une même mesure");
  }

  let changedCount = 0;
  let unchangedCount = 0;
  const failures: ThemeReclassificationBatchFailure[] = [];

  for (const input of inputs) {
    try {
      const result = await reclassifyMeasureTheme(input);
      if (result.changed) changedCount += 1;
      else unchangedCount += 1;
    } catch (error) {
      if (error instanceof MeasureConcurrencyError || error instanceof MeasureValidationError) {
        failures.push({
          measureId: input.measureId,
          message: error.message,
          stale: error instanceof MeasureConcurrencyError,
        });
        continue;
      }
      throw error;
    }
  }

  return { changedCount, unchangedCount, failures };
}
