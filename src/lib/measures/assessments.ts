import type { QualificationKind, SimilarityConclusion } from "@/generated/prisma";
import { db } from "@/lib/db";
import { MeasureValidationError } from "./errors";

/**
 * A dated editorial conclusion on one formulation. Never a field on the measure: an
 * editorial conclusion stored as a fact goes stale silently, and "funding not specified"
 * depends on the text that was analysed.
 *
 * Attached to the REVISION, so a reformulation does not inherit the conclusion.
 *
 * Each QualificationKind value needs an opposable definition before it can be used. See
 * docs/editorial/qualifications-mesures.md, which states the corpus to examine for each
 * one: "funding not specified" gives three different answers depending on whether the
 * reviewer read the revision alone, its primary sources, or the whole programme.
 */
export async function createQualification(input: {
  measureRevisionId: string;
  kind: QualificationKind;
  label: string;
  rationale: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  assessedBy: string;
}): Promise<void> {
  if (input.rationale.trim() === "") {
    throw new MeasureValidationError("Une qualification exige une justification");
  }
  if (input.assessedBy.trim() === "") {
    throw new MeasureValidationError("Une qualification exige un auteur identifié");
  }
  // Half a source is worse than none: a label with no link cannot be checked, and a link
  // with no label cannot be displayed.
  const hasUrl = (input.sourceUrl ?? "").trim() !== "";
  const hasLabel = (input.sourceLabel ?? "").trim() !== "";
  if (hasUrl !== hasLabel) {
    throw new MeasureValidationError("Une source exige son URL et son libellé, les deux ou aucun");
  }

  await db.measureQualification.create({
    data: {
      measureRevisionId: input.measureRevisionId,
      kind: input.kind,
      label: input.label,
      rationale: input.rationale,
      sourceUrl: hasUrl ? input.sourceUrl : null,
      sourceLabel: hasLabel ? input.sourceLabel : null,
      assessedAt: new Date(),
      assessedBy: input.assessedBy,
    },
  });
}

/**
 * Uniqueness as a dated assessment on one formulation, with the state of the corpus it was
 * compared against. A boolean isUnique would be wrong the day the next programme is
 * published, and "equivalent" has no single definition.
 *
 * The conclusion and the matches are one editorial statement, so they are validated
 * together and written in one transaction.
 */
export async function createSimilarityAssessment(input: {
  measureRevisionId: string;
  comparedCorpusVersion: string;
  conclusion: SimilarityConclusion;
  rationale: string;
  assessedBy: string;
  equivalentRevisionIds: string[];
}): Promise<void> {
  const hasMatches = input.equivalentRevisionIds.length > 0;
  if (input.conclusion === "EQUIVALENT_FOUND" && !hasMatches) {
    throw new MeasureValidationError(
      "Une conclusion EQUIVALENT_FOUND exige au moins un équivalent identifié"
    );
  }
  if (input.conclusion !== "EQUIVALENT_FOUND" && hasMatches) {
    throw new MeasureValidationError(
      `Une conclusion ${input.conclusion} ne peut pas porter d'équivalent identifié`
    );
  }
  if (input.comparedCorpusVersion.trim() === "") {
    throw new MeasureValidationError("L'évaluation exige la version du corpus comparé");
  }

  await db.$transaction(async (tx) => {
    const assessment = await tx.measureSimilarityAssessment.create({
      data: {
        measureRevisionId: input.measureRevisionId,
        comparedCorpusVersion: input.comparedCorpusVersion,
        assessedAt: new Date(),
        assessedBy: input.assessedBy,
        conclusion: input.conclusion,
        rationale: input.rationale,
      },
    });

    if (hasMatches) {
      await tx.measureSimilarityMatch.createMany({
        data: input.equivalentRevisionIds.map((id) => ({
          assessmentId: assessment.id,
          equivalentMeasureRevisionId: id,
        })),
      });
    }
  });
}
