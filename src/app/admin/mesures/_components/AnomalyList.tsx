import { MODERATION_ANOMALY_LABELS } from "@/config/labels";
import type { ModerationAnomaly } from "@/lib/measures/moderation-state";

/**
 * The anomalies of a measure, named with the same vocabulary as `npm run measures:audit`.
 *
 * Each entry carries the identifiers involved, so a moderator can go and fix the row instead
 * of only knowing that something is wrong.
 */
export function AnomalyList({ anomalies }: { anomalies: ModerationAnomaly[] }) {
  if (anomalies.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune anomalie détectée sur cette mesure et ses révisions.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {anomalies.map((anomaly) => (
        <li
          key={`${anomaly.code}-${anomaly.detail}`}
          className="rounded border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40"
        >
          <p className="font-medium text-red-800 dark:text-red-300">
            {MODERATION_ANOMALY_LABELS[anomaly.code]}
          </p>
          <p className="mt-1 font-mono text-xs break-all text-red-700/80 dark:text-red-400/80">
            {anomaly.code}
            {anomaly.detail !== "" && ` · ${anomaly.detail}`}
          </p>
        </li>
      ))}
    </ul>
  );
}
