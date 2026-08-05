import { PUBLICATION_STATE_LABELS, PUBLICATION_STATUS_LABELS } from "@/config/labels";
import type { ModerationState, PublicationState } from "@/lib/measures/moderation-state";

/**
 * The moderation state of a measure, as several chips rather than one label.
 *
 * One chip per fact, on purpose. A single badge would have to choose between "published" and
 * "withdrawn" and "a correction is under review", and those coexist. The pair that matters
 * most is "published" beside "invisible to the public": collapsing them would hide the case a
 * moderator has to act on.
 */

const CHIP = "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium";

const STATE_STYLES: Record<PublicationState, string> = {
  EMPTY:
    "bg-slate-50 text-slate-600 border-slate-300 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700",
  DRAFT:
    "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  REVIEWED:
    "bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800",
  PUBLISHED:
    "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
  DEPUBLISHED:
    "bg-slate-100 text-slate-700 border-slate-400 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-600",
};

const WARNING =
  "bg-red-50 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900";
const NEUTRAL = "bg-muted text-muted-foreground border-border";

export function ModerationStateBadge({ state }: { state: ModerationState }) {
  const unexpectedlyHidden = state.publication === "PUBLISHED" && !state.publiclyVisible;
  const statusDisagrees = state.declaredStatus !== "PUBLISHED" && state.declaredStatus !== "DRAFT";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`${CHIP} ${STATE_STYLES[state.publication]}`}>
        {PUBLICATION_STATE_LABELS[state.publication]}
      </span>

      {unexpectedlyHidden && (
        <span className={`${CHIP} ${WARNING}`}>Publiée mais invisible du public</span>
      )}

      {statusDisagrees && (
        <span className={`${CHIP} ${WARNING}`}>
          Statut en base : {PUBLICATION_STATUS_LABELS[state.declaredStatus]}
        </span>
      )}

      {state.withdrawal !== null && (
        <span className={`${CHIP} ${NEUTRAL}`}>
          {state.withdrawal.sourceUrl && state.withdrawal.sourceLabel
            ? "Retirée, sourcée"
            : "Retirée, source incomplète"}
        </span>
      )}

      {state.activeDraft !== null && state.draftIsCorrection && (
        <span className={`${CHIP} ${NEUTRAL}`}>
          {state.activeDraft.reviewed ? "Correction relue en attente" : "Correction en cours"}
        </span>
      )}

      {state.anomalies.length > 0 && (
        <span className={`${CHIP} ${WARNING}`}>
          {state.anomalies.length === 1 ? "1 anomalie" : `${state.anomalies.length} anomalies`}
        </span>
      )}
    </div>
  );
}
