import { MEASURE_REVIEW_READINESS_LABELS, MEASURE_REVIEW_WARNING_LABELS } from "@/config/labels";
import type { MeasureReviewWarning } from "@/generated/prisma";

export type AdminReviewReadiness =
  | "READY_FOR_REVIEW"
  | "REVIEW_WITH_WARNING"
  | "TECHNICALLY_BLOCKED";

export function ReviewReadinessPanel({
  readiness,
  warnings,
  blockers = [],
}: {
  readiness: AdminReviewReadiness;
  warnings: MeasureReviewWarning[];
  blockers?: string[];
}) {
  if (readiness === "TECHNICALLY_BLOCKED") {
    return (
      <div
        role="alert"
        className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
      >
        <p className="font-medium">Blocage technique, aucun DRAFT ne doit être créé</p>
        {blockers.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p
        className={`rounded border p-3 text-sm font-medium ${
          readiness === "REVIEW_WITH_WARNING"
            ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            : "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200"
        }`}
      >
        {MEASURE_REVIEW_READINESS_LABELS[readiness]}
      </p>
      <p className="text-xs text-muted-foreground">
        Cet état signifie seulement que la proposition peut être examinée. Il ne valide ni son fond,
        ni sa formulation, ni sa publication.
      </p>
      {warnings.length > 0 && (
        <ul
          aria-label="Warnings de revue"
          className="space-y-1 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
        >
          {warnings.map((warning) => (
            <li key={warning}>Attention : {MEASURE_REVIEW_WARNING_LABELS[warning]}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
