import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ImageOff,
  FileWarning,
  Scale,
  FileQuestion,
  EyeOff,
  Plus,
  Clock,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  XCircle,
} from "lucide-react";

interface DataHealthItem {
  label: string;
  count: number;
  total?: number;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  color: string;
}

async function getDashboardData() {
  // Single SQL for all counts — prevents pool starvation (8 parallel counts → 1 query)
  const counts = await db.$queryRaw<
    [
      {
        total_politicians: bigint;
        published_politicians: bigint;
        without_photo: bigint;
        draft_politicians: bigint;
        without_bio: bigint;
        total_affairs: bigint;
        draft_affairs: bigint;
        without_ecli: bigint;
      },
    ]
  >`
    SELECT
      COUNT(*)                                                                           AS total_politicians,
      COUNT(*) FILTER (WHERE "publicationStatus" = 'PUBLISHED')                          AS published_politicians,
      COUNT(*) FILTER (WHERE "publicationStatus" = 'PUBLISHED' AND "photoUrl" IS NULL)   AS without_photo,
      COUNT(*) FILTER (WHERE "publicationStatus" = 'DRAFT')                              AS draft_politicians,
      COUNT(*) FILTER (WHERE "publicationStatus" = 'PUBLISHED' AND "biography" IS NULL)  AS without_bio,
      (SELECT COUNT(*) FROM "Affair")                                                    AS total_affairs,
      (SELECT COUNT(*) FROM "Affair" WHERE "publicationStatus" = 'DRAFT')                AS draft_affairs,
      -- « Sans référence judiciaire » se mesure sur les décisions rattachées : la
      -- colonne ecli a été retirée d'Affair (#545).
      (SELECT COUNT(*) FROM "Affair" a
        WHERE a."publicationStatus" = 'PUBLISHED'
          AND NOT EXISTS (SELECT 1 FROM "AffairCourtDecision" acd WHERE acd."affairId" = a.id)
      ) AS without_ecli
    FROM "Politician"
  `;

  const c = counts[0];
  const totalPoliticians = Number(c.total_politicians);
  const publishedPoliticians = Number(c.published_politicians);
  const politiciansWithoutPhoto = Number(c.without_photo);
  const politiciansDraft = Number(c.draft_politicians);
  const biographiesMissing = Number(c.without_bio);
  const totalAffairs = Number(c.total_affairs);
  const affairsDraft = Number(c.draft_affairs);
  const affairsWithoutEcli = Number(c.without_ecli);

  // These 2 queries need actual rows, not counts — run in parallel (2 = fine with max:2 pool)
  const [recentActivity, syncHistory] = await Promise.all([
    db.auditLog.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
    }),
    db.syncJob.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const withPhoto = publishedPoliticians - politiciansWithoutPhoto;
  const withBio = publishedPoliticians - biographiesMissing;
  const completeness =
    publishedPoliticians > 0
      ? Math.round(((withPhoto + withBio) / (publishedPoliticians * 2)) * 100)
      : 0;

  return {
    totalPoliticians,
    publishedPoliticians,
    politiciansWithoutPhoto,
    politiciansDraft,
    biographiesMissing,
    totalAffairs,
    affairsDraft,
    affairsWithoutEcli,
    completeness,
    recentActivity,
    syncHistory,
  };
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin}min`;
  if (diffH < 24) return `il y a ${diffH}h`;
  if (diffD < 7) return `il y a ${diffD}j`;
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formatDuration(start: Date | null, end: Date | null): string {
  if (!start || !end) return "-";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}min ${sec % 60}s`;
}

const ACTION_ICONS: Record<string, { icon: typeof Plus; className: string }> = {
  CREATE: { icon: Plus, className: "text-emerald-600 bg-emerald-50" },
  UPDATE: { icon: RefreshCw, className: "text-primary bg-primary/10" },
  DELETE: { icon: XCircle, className: "text-red-600 bg-red-50" },
};

const SYNC_STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RUNNING: "bg-blue-50 text-blue-700 border-blue-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
};

export default async function AdminDashboard() {
  const data = await getDashboardData();

  const healthItems: DataHealthItem[] = [
    {
      label: "Affaires à modérer",
      count: data.affairsDraft,
      icon: Scale,
      href: "/admin/affaires?status=DRAFT",
      color: "oklch(0.52 0.2 25)",
    },
    {
      label: "Politiciens sans photo",
      count: data.politiciansWithoutPhoto,
      total: data.publishedPoliticians,
      icon: ImageOff,
      href: "/admin/politiques?filter=no-photo",
      color: "oklch(0.55 0.15 250)",
    },
    {
      label: "Biographies manquantes",
      count: data.biographiesMissing,
      total: data.publishedPoliticians,
      icon: FileQuestion,
      href: "/admin/politiques?filter=no-bio",
      color: "oklch(0.55 0.15 310)",
    },
    {
      label: "Affaires sans ECLI",
      count: data.affairsWithoutEcli,
      icon: FileWarning,
      href: "/admin/affaires?filter=no-ecli",
      color: "oklch(0.55 0.18 65)",
    },
    {
      label: "Politiciens DRAFT",
      count: data.politiciansDraft,
      icon: EyeOff,
      href: "/admin/politiques?status=DRAFT",
      color: "oklch(0.5 0.12 200)",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.totalPoliticians} politiciens &middot; {data.totalAffairs} affaires
          </p>
        </div>
        <Link
          href="/admin/affaires/nouveau"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: "oklch(0.52 0.2 25)" }}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Nouvelle affaire
        </Link>
      </div>

      {/* Data Health + Activity Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Data Health — 2 cols */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display font-semibold">Santé des données</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${data.completeness}%`,
                    backgroundColor:
                      data.completeness > 80
                        ? "oklch(0.6 0.18 145)"
                        : data.completeness > 50
                          ? "oklch(0.6 0.15 80)"
                          : "oklch(0.6 0.18 25)",
                  }}
                />
              </div>
              <span>{data.completeness}% complet</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {healthItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} href={item.href}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div
                          className="p-2 rounded-lg"
                          style={{
                            backgroundColor: `color-mix(in oklch, ${item.color} 12%, transparent)`,
                          }}
                        >
                          <span style={{ color: item.color }}>
                            <Icon className="w-4 h-4" aria-hidden="true" />
                          </span>
                        </div>
                        <span
                          className="text-2xl font-bold font-display"
                          style={{ color: item.count > 0 ? item.color : undefined }}
                        >
                          {item.count}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 group-hover:text-foreground transition-colors">
                        {item.label}
                      </p>
                      {item.total && (
                        <div className="mt-2 w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(2, ((item.total - item.count) / item.total) * 100)}%`,
                              backgroundColor: item.color,
                            }}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Activity Timeline — 1 col */}
        <div className="space-y-4">
          <h2 className="text-lg font-display font-semibold">Activité récente</h2>
          <Card>
            <CardContent className="p-0">
              {data.recentActivity.length > 0 ? (
                <ul className="divide-y divide-border">
                  {data.recentActivity.slice(0, 10).map((entry) => {
                    const actionMeta = ACTION_ICONS[entry.action] || ACTION_ICONS.UPDATE;
                    const ActionIcon = actionMeta!.icon;
                    return (
                      <li key={entry.id} className="px-4 py-3 flex items-start gap-3">
                        <div
                          className={`p-1.5 rounded-md shrink-0 mt-0.5 ${actionMeta!.className}`}
                        >
                          <ActionIcon className="w-3 h-3" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">
                            <span className="font-medium">{entry.action}</span>{" "}
                            <span className="text-muted-foreground">{entry.entityType}</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatRelativeTime(entry.createdAt)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Aucune activité récente
                </div>
              )}
            </CardContent>
          </Card>

          {data.recentActivity.length > 10 && (
            <Link
              href="/admin/audit"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Voir tout l&apos;historique &rarr;
            </Link>
          )}
        </div>
      </div>

      {/* Sync History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold">Dernières synchronisations</h2>
          <Link
            href="/admin/syncs"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Gérer les syncs &rarr;
          </Link>
        </div>

        {data.syncHistory.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Script</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Statut</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                        Durée
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                        Stats
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.syncHistory.map((job) => (
                      <tr key={job.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">{job.script}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={SYNC_STATUS_STYLES[job.status] || ""}>
                            {job.status === "COMPLETED" && (
                              <CheckCircle2 className="w-3 h-3 mr-1" aria-hidden="true" />
                            )}
                            {job.status === "FAILED" && (
                              <AlertCircle className="w-3 h-3 mr-1" aria-hidden="true" />
                            )}
                            {job.status === "RUNNING" && (
                              <RefreshCw className="w-3 h-3 mr-1 animate-spin" aria-hidden="true" />
                            )}
                            {job.status === "PENDING" && (
                              <Clock className="w-3 h-3 mr-1" aria-hidden="true" />
                            )}
                            {job.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                          {formatDuration(job.startedAt, job.completedAt)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                          {job.processed != null && job.total != null
                            ? `${job.processed}/${job.total}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatRelativeTime(job.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Aucune synchronisation enregistrée.{" "}
              <Link href="/admin/syncs" className="text-foreground hover:underline">
                Lancer une sync
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
