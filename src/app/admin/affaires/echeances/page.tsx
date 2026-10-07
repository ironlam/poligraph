import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AffairMonitoringActions } from "@/components/admin/AffairMonitoringActions";
import { Badge } from "@/components/ui/badge";
import { AFFAIR_STATUS_LABELS } from "@/config/labels";
import { parisDay } from "@/lib/affairs/monitoring/cadence";
import { NEEDS_HUMAN_LABELS, dayKey, dueLine } from "@/lib/affairs/monitoring/labels";
import {
  QUEUE_LIMIT,
  getMonitoringQueue,
  type MonitoringQueueRow,
} from "@/lib/affairs/monitoring/queries";
import { isAuthenticated } from "@/lib/auth";
import { formatDateShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

function QueueRow({
  row,
  minDate,
  actions,
}: {
  row: MonitoringQueueRow;
  minDate: string;
  actions: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <div className="flex min-w-0 flex-[2_1_16rem] flex-wrap items-center gap-x-3 gap-y-1">
        {row.reason && <Badge variant="destructive">{NEEDS_HUMAN_LABELS[row.reason]}</Badge>}
        <div className="min-w-0">
          <Link
            href={`/admin/affaires/${row.affairId}`}
            className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
          >
            {row.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            {row.publicId ? `${row.publicId} · ` : ""}
            {row.politicianName} · {AFFAIR_STATUS_LABELS[row.status]}
          </p>
        </div>
      </div>
      <div className="flex-[1_1_12rem] text-sm">
        <p>
          Vérifier le{" "}
          <time dateTime={dayKey(row.nextReviewAt)}>{formatDateShort(row.nextReviewAt)}</time>
        </p>
        <p className="text-xs text-muted-foreground">{dueLine(row.dueReason, row.dateOrigin)}</p>
        {row.dueNote && <p className="text-xs text-muted-foreground">{row.dueNote}</p>}
      </div>
      {actions && <AffairMonitoringActions affairId={row.affairId} minDate={minDate} />}
    </li>
  );
}

export default async function AdminMonitoringQueuePage() {
  if (!(await isAuthenticated())) redirect("/admin/login");

  const { toHandle, upcoming, toHandleTotal, upcomingTotal } = await getMonitoringQueue();
  const tomorrow = dayKey(new Date(parisDay(new Date()).getTime() + 24 * 60 * 60 * 1000));

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Échéances des affaires"
        description="Affaires publiées dont la situation est à vérifier ou dont la prochaine vérification approche."
      />

      <section aria-labelledby="handle-title" className="space-y-3">
        <h2 id="handle-title" className="font-display text-lg font-semibold">
          À traiter
        </h2>
        {toHandleTotal > toHandle.length && (
          <p className="text-sm text-muted-foreground">
            {QUEUE_LIMIT} premières sur {toHandleTotal}
          </p>
        )}
        {toHandle.length === 0 ? (
          <p className="text-sm text-muted-foreground">Rien à traiter aujourd{"'"}hui.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {toHandle.map((row) => (
              <QueueRow key={row.affairId} row={row} minDate={tomorrow} actions />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="upcoming-title" className="space-y-3">
        <h2 id="upcoming-title" className="font-display text-lg font-semibold">
          À venir (14 jours)
        </h2>
        {upcomingTotal > upcoming.length && (
          <p className="text-sm text-muted-foreground">
            {QUEUE_LIMIT} premières sur {upcomingTotal}
          </p>
        )}
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune vérification prévue dans les 14 jours.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {upcoming.map((row) => (
              <QueueRow key={row.affairId} row={row} minDate={tomorrow} actions={false} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
