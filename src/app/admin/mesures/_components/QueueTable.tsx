import Link from "next/link";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EnrichmentState, MeasureQueueRow } from "../_data/queue-query";
import { ModerationStateBadge } from "./ModerationStateBadge";

const ENRICHMENT_ACTIONS: Record<EnrichmentState, { label: string; hash: string }> = {
  SUBTOPICS_PENDING: { label: "Valider les sous-thèmes", hash: "#subtopics-heading" },
  SUBTOPICS_APPROVED: { label: "Consulter les sous-thèmes", hash: "#subtopics-heading" },
  DETAILS_MISSING: { label: "Compléter le contexte", hash: "#actions-heading" },
};

/**
 * The queue itself.
 *
 * A real `<table>` with `<th scope="col">`, not a CSS grid: applying `display: grid` to a
 * table destroys the tabular semantics screen readers rely on. Wide content scrolls inside its
 * own container so the page never scrolls horizontally.
 */
export function QueueTable({
  rows,
  activeEnrichment,
}: {
  rows: MeasureQueueRow[];
  activeEnrichment?: EnrichmentState;
}) {
  const formatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });
  const activeAction = activeEnrichment ? ENRICHMENT_ACTIONS[activeEnrichment] : null;

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
              Action
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
                <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                  {row.suggestedSubtopicCount > 0 && (
                    <span>{row.suggestedSubtopicCount} sous-thème(s) à valider</span>
                  )}
                  {row.approvedSubtopicCount > 0 && (
                    <span>{row.approvedSubtopicCount} sous-thème(s) validé(s)</span>
                  )}
                  {!row.hasDetails && <span>Contexte à compléter</span>}
                </div>
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap text-muted-foreground">
                {formatter.format(row.createdAt)}
              </td>
              <td className="px-3 py-3 align-top">
                <Link
                  href={`/admin/mesures/${row.id}${activeAction?.hash ?? ""}`}
                  prefetch={false}
                  className={cn(
                    buttonVariants({ variant: activeAction ? "default" : "outline" }),
                    "min-h-11 whitespace-normal text-center"
                  )}
                >
                  {activeAction?.label ?? "Examiner"}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
