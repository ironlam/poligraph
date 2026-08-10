import { Badge } from "@/components/ui/badge";
import { SourceLine } from "@/components/ui/SourceLine";
import { MILESTONES, SOURCE_DECREE, SOURCE_SENAT } from "../_content";

/**
 * The five dates of the renewal.
 *
 * A dedicated list rather than the shared `ElectionKeyDates`: that component renders
 * the `Election` model's date columns, and two of these milestones have no column (the
 * 5 June designation of delegates, the October election of the Senate president). It
 * would drop them silently.
 *
 * Only the last one is not settled by a published act, and it says so instead of
 * being dressed up as a fixed date.
 */
export function SenateMilestones() {
  return (
    <section aria-labelledby="dates-heading" className="space-y-4">
      <h2 id="dates-heading" className="font-display text-xl font-bold tracking-tight md:text-2xl">
        Dates clés
      </h2>

      <ol className="space-y-3">
        {MILESTONES.map((milestone) => (
          <li key={milestone.label} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40"
            />
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-semibold">{milestone.label}</span>
                <span className="text-sm text-muted-foreground">{milestone.when}</span>
                {!milestone.confirmed && (
                  <Badge variant="outline" className="text-xs">
                    Date non fixée
                  </Badge>
                )}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                {milestone.note}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <SourceLine sources={[SOURCE_DECREE, SOURCE_SENAT]} reportHref={null} />
    </section>
  );
}
