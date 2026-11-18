import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { ScrutinPolicyTitleRevision } from "@/generated/prisma";

const ACTION_LABELS: Record<string, string> = {
  generated: "Généré",
  edited: "Édité",
  approved: "Approuvé",
  rejected: "Rejeté",
  regenerate_requested: "Régénération demandée",
  regenerated: "Régénéré",
  official_title_refreshed: "Titre officiel corrigé à la source",
};

const ACTION_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  approved: "default",
  rejected: "destructive",
  edited: "secondary",
  regenerated: "secondary",
  regenerate_requested: "outline",
  generated: "outline",
};

interface SnapshotShape {
  policyTitle?: string | null;
  rejectionReason?: string | null;
  approvalOverride?: { reason?: string | null } | null;
}

function asSnapshot(value: unknown): SnapshotShape {
  if (value && typeof value === "object") return value as SnapshotShape;
  return {};
}

function extractReason(snapshot: SnapshotShape): string | null {
  if (snapshot.approvalOverride?.reason) return snapshot.approvalOverride.reason;
  if (snapshot.rejectionReason) return snapshot.rejectionReason;
  return null;
}

export function RevisionHistory({ revisions }: { revisions: ScrutinPolicyTitleRevision[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Historique des révisions</CardTitle>
      </CardHeader>
      <CardContent>
        {revisions.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">Aucune révision enregistrée.</p>
        ) : (
          <ol className="space-y-3">
            {revisions.map((rev) => {
              const snapshot = asSnapshot(rev.snapshot);
              const reason = extractReason(snapshot);
              return (
                <li key={rev.id} className="border-l-2 border-muted pl-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={ACTION_VARIANT[rev.action] ?? "outline"}>
                      {ACTION_LABELS[rev.action] ?? rev.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(rev.createdAt)}
                    </span>
                    {rev.actorId ? (
                      <span className="text-xs text-muted-foreground">par {rev.actorId}</span>
                    ) : null}
                  </div>
                  {snapshot.policyTitle ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Titre précédent : « {snapshot.policyTitle} »
                    </p>
                  ) : null}
                  {reason ? <p className="mt-1 text-sm">Motif : {reason}</p> : null}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
