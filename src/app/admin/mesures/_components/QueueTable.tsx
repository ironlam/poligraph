import Link from "next/link";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import type { MeasureQueueRow } from "../_data/queue-query";
import { ModerationStateBadge } from "./ModerationStateBadge";

/**
 * The queue itself.
 *
 * A real `<table>` with `<th scope="col">`, not a CSS grid: applying `display: grid` to a
 * table destroys the tabular semantics screen readers rely on. Wide content scrolls inside its
 * own container so the page never scrolls horizontally.
 */
export function QueueTable({ rows }: { rows: MeasureQueueRow[] }) {
  const formatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center">
        <p className="text-sm font-medium">Aucune mesure ne correspond à ces filtres.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Les compteurs ci-dessus indiquent ce que contiennent les autres étapes.
        </p>
      </div>
    );
  }

  return (
    // `relative` is load-bearing, not decoration. `sr-only` is position: absolute, so the
    // hidden label in the last header cell is placed against the nearest positioned ancestor.
    // Without it, that ancestor is outside the scroll container, the label lands at x=736 in
    // the document, and the whole PAGE scrolls horizontally by 361px on a 375px viewport.
    // Measured, then fixed.
    <div className="relative overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Mesures en attente de relecture, de la plus ancienne à la plus récente
        </caption>
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
              Candidature
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
              Texte de référence
              <span className="block text-xs font-normal">
                La révision publiée, ou le brouillon à défaut
              </span>
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
              Thème
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
              État
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
              Saisie
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">
              <span className="sr-only">Ouvrir la fiche de modération</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id} className="transition-colors hover:bg-muted/30">
              <td className="px-3 py-3 align-top whitespace-nowrap">{row.politicianName}</td>
              <td className="max-w-md px-3 py-3 align-top">
                {row.referenceText === null ? (
                  // Never an empty cell and never a lone dash: the absence carries its reason.
                  <span className="text-muted-foreground">Aucune révision saisie</span>
                ) : (
                  <span className="line-clamp-3">{row.referenceText}</span>
                )}
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap">
                {THEME_CATEGORY_LABELS[row.theme]}
              </td>
              <td className="px-3 py-3 align-top">
                <ModerationStateBadge state={row.state} />
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap text-muted-foreground">
                {formatter.format(row.createdAt)}
              </td>
              <td className="px-3 py-3 align-top">
                <Link
                  href={`/admin/mesures/${row.id}`}
                  prefetch={false}
                  className="inline-flex min-h-11 items-center text-primary underline"
                >
                  Examiner
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
