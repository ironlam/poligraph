import { AFFAIR_EVENT_TYPE_LABELS } from "@/config/labels";
import { formatEventDate, isUpcoming } from "@/lib/affairs/events/dates";
import { sortEvents } from "@/lib/affairs/events/order";
import type { PublicAffairEvent } from "@/components/affairs/AffairChronology";

interface ChronologySummaryProps {
  events: PublicAffairEvent[];
  today: Date;
}

function label(e: PublicAffairEvent): string {
  return `${AFFAIR_EVENT_TYPE_LABELS[e.type]}, ${formatEventDate(e)}`;
}

/** Résumé en une ligne de la chronologie publique, pour la fiche d'un élu. */
export function ChronologySummary({ events, today }: ChronologySummaryProps) {
  const published = sortEvents(events.filter((e) => e.status === "PUBLISHED"));
  if (published.length === 0) return null;

  const last = [...published].reverse().find((e) => e.occurrence === "HELD");
  const next = published.find((e) => isUpcoming(e, today));

  const parts = [`${published.length} ${published.length === 1 ? "étape" : "étapes"}`];
  if (last) parts.push(`dernière : ${label(last)}`);
  if (next) parts.push(`prochaine : ${label(next)}`);

  return <p className="text-sm text-muted-foreground">{parts.join(" · ")}</p>;
}
