import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AffairMonitoringActions } from "@/components/admin/AffairMonitoringActions";
import type { AffairMonitoringPanel } from "@/lib/affairs/monitoring/queries";
import { NEEDS_HUMAN_LABELS, dueLine } from "@/lib/affairs/monitoring/labels";
import { formatDate } from "@/lib/utils";

type Check = AffairMonitoringPanel["checks"][number];

function outcomeText(check: Check): string {
  switch (check.outcome) {
    case "NO_CHANGE":
      return "Vérifiée, rien de neuf";
    case "DEFERRED":
      return `Reportée${check.nextReviewAtAfter ? ` au ${formatDate(check.nextReviewAtAfter)}` : ""}`;
    case "NO_RESULT":
      return "Aucun résultat";
    case "DATE_ANNOUNCED":
      return "Date annoncée";
    case "SIGNAL":
      return "Évolution détectée";
    case "UPDATED":
      return "Mise à jour";
    default:
      return "Échec";
  }
}

export function AffairMonitoringCard({
  affairId,
  panel,
  minDate,
}: {
  affairId: string;
  panel: AffairMonitoringPanel | null;
  /** Lendemain (jour de Paris) au format AAAA-MM-JJ. */
  minDate: string;
}) {
  if (!panel || !panel.monitoring.active) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Échéance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {panel ? "Échéance inactive" : "Aucune échéance"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <AffairMonitoringActions affairId={affairId} minDate={minDate} showNoChange={false} />
          </div>
        </CardContent>
      </Card>
    );
  }
  const { monitoring, checks, reason } = panel;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Échéance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {reason && <Badge variant="destructive">{NEEDS_HUMAN_LABELS[reason]}</Badge>}
            <span className="text-sm">
              Prochaine vérification le <strong>{formatDate(monitoring.nextReviewAt)}</strong>
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {dueLine(monitoring.dueReason, monitoring.dateOrigin)}
          </p>
          {monitoring.dueNote && <p className="text-sm">{monitoring.dueNote}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AffairMonitoringActions affairId={monitoring.affairId} minDate={minDate} />
        </div>
        <div>
          <h3 className="text-sm font-medium">Historique</h3>
          {checks.length ? (
            <ul className="mt-2 divide-y text-sm">
              {checks.map((check) => (
                <li key={check.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
                  <time dateTime={check.checkedAt.toISOString()} className="text-muted-foreground">
                    {formatDate(check.checkedAt)}
                  </time>
                  <span>{outcomeText(check)}</span>
                  <span className="text-xs text-muted-foreground">
                    {check.actor === "HUMAN" ? "par l'admin" : "contrôle automatique"}
                  </span>
                  {check.note && <span className="w-full text-muted-foreground">{check.note}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Aucun contrôle enregistré.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
