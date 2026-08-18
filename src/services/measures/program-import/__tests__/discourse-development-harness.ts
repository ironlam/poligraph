import type { DiscourseAnnotation, DiscourseRole, DiscourseSpeaker } from "../discourse";
import { RUFFIN_DISCOURSE_DEVELOPMENT } from "./fixtures/ruffin-discourse-development";

type Confusion<T extends string> = Partial<Record<T, Partial<Record<T, number>>>>;

function increment<T extends string>(matrix: Confusion<T>, expected: T, actual: T) {
  matrix[expected] ??= {};
  const row = matrix[expected]!;
  row[actual] = (row[actual] ?? 0) + 1;
}

export function evaluateDiscourseDevelopment(annotations: DiscourseAnnotation[]) {
  const speakerMatrix: Confusion<DiscourseSpeaker> = {};
  const roleMatrix: Confusion<DiscourseRole> = {};
  const rows = RUFFIN_DISCOURSE_DEVELOPMENT.map((entry, index) => {
    const annotation = annotations[index];
    const actualSpeaker = annotation?.speaker ?? "UNRESOLVED";
    const actualRole = annotation?.discourseRole ?? "OTHER";
    increment(speakerMatrix, entry.expectedSpeaker, actualSpeaker);
    increment(roleMatrix, entry.expectedRole, actualRole);
    return {
      id: entry.id,
      expectedSpeaker: entry.expectedSpeaker,
      actualSpeaker,
      expectedRole: entry.expectedRole,
      actualRole,
      speakerCorrect: actualSpeaker === entry.expectedSpeaker,
      roleCorrect: actualRole === entry.expectedRole,
      previousHumanReviewError: entry.previousHumanReviewError,
    };
  });
  return {
    rows,
    speakerMatrix,
    roleMatrix,
    metrics: {
      total: rows.length,
      speakerCorrect: rows.filter((row) => row.speakerCorrect).length,
      roleCorrect: rows.filter((row) => row.roleCorrect).length,
      previousErrorsFullyCorrect: rows.filter(
        (row) => row.previousHumanReviewError && row.speakerCorrect && row.roleCorrect
      ).length,
      previousErrors: rows.filter((row) => row.previousHumanReviewError).length,
    },
  };
}
