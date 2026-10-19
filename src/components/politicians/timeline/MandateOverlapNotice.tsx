import { MANDATE_TYPE_LABELS } from "@/config/labels";
import { findOverlappingParliamentaryMandates } from "@/lib/mandates/overlaps";
import { formatDate } from "@/lib/utils";
import type { TimelineMandate } from "./types";

export function MandateOverlapNotice({ mandates }: { mandates: TimelineMandate[] }) {
  const overlaps = findOverlappingParliamentaryMandates(mandates);
  if (overlaps.length === 0) return null;

  return (
    <div
      role="status"
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <p className="font-medium">Périodes de mandat à vérifier</p>
      <p className="mt-1">
        Des périodes de mandat parlementaire se chevauchent. Elles sont indiquées ici et retirées de
        la chronologie tant que leurs dates ne sont pas vérifiées.
      </p>
      <ul className="mt-2 list-inside list-disc space-y-1">
        {overlaps.map(({ first, second }) => (
          <li key={`${first.id}:${second.id}`}>
            {MANDATE_TYPE_LABELS[first.type]} : {formatDate(first.startDate)} – {intervalEnd(first)}
            {" ; "}
            {formatDate(second.startDate)} – {intervalEnd(second)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function intervalEnd(mandate: TimelineMandate): string {
  if (mandate.isCurrent) return "en cours";
  if (mandate.endDate === null) return "fin inconnue";
  return formatDate(mandate.endDate);
}
