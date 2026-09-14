import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getDashboardCounts, getDashboardSecondaryData } from "@/lib/admin/dashboard";
import {
  CheckCircle2,
  CopyCheck,
  FileCheck2,
  Fingerprint,
  GitPullRequestArrow,
  HeartPulse,
  Newspaper,
  Plus,
  RefreshCw,
  Scale,
  ShieldAlert,
} from "lucide-react";

type QueueCard = {
  label: string;
  count: number;
  description: string;
  href: string;
  icon: typeof Scale;
};

function relativeTime(value: Date): string {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function QueueGrid({ cards, emptyLabel }: { cards: QueueCard[]; emptyLabel: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Link key={card.label} href={card.href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  </div>
                  <span
                    className={`font-display text-2xl font-bold ${card.count ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {card.count}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium">{card.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {card.count ? card.description : emptyLabel}
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Chargement des sections secondaires" className="space-y-8">
      <span className="sr-only">Chargement en cours</span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <Card key={item} className="h-32 animate-pulse">
            <CardContent className="p-4">
              <div className="h-8 w-12 rounded bg-muted" />
              <div className="mt-4 h-4 w-3/4 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

async function SecondaryDashboardSections() {
  const data = await getDashboardSecondaryData();
  const cards: QueueCard[] = [
    {
      label: "Doublons à trancher",
      count: data.duplicates,
      description: "Comparer les paires proposées.",
      href: "/admin/affaires/doublons",
      icon: CopyCheck,
    },
    {
      label: "Pipelines en échec",
      count: data.failedPipelines,
      description: "Diagnostiquer les pipelines critiques.",
      href: "/admin/pipelines?status=critical",
      icon: HeartPulse,
    },
    {
      label: "Synchronisations en échec",
      count: data.failedSyncs,
      description: "Inspecter les exécutions interrompues.",
      href: "/admin/syncs?status=FAILED",
      icon: RefreshCw,
    },
  ];
  return (
    <>
      <QueueGrid cards={cards} emptyLabel="File vide, aucune action en attente." />
      <section aria-labelledby="tracking-title" className="space-y-4">
        <div>
          <h2 id="tracking-title" className="font-display text-lg font-semibold">
            Suivi
          </h2>
          <p className="text-sm text-muted-foreground">
            Des stocks et des journaux, pas des files : ces compteurs ne se vident pas et n{"'"}
            attendent aucune action de votre part.
          </p>
        </div>
        <QueueGrid
          cards={[
            {
              label: "Liaisons au registre",
              count: data.decisionsPending,
              description: "Stock de rapprochements non revus.",
              href: "/admin/affair-matching/review?tab=UNDECIDED",
              icon: Fingerprint,
            },
            {
              label: "Rejets presse (7 j)",
              count: data.rejectionsPending,
              description: "Journal des rejets de l'analyse presse, sur les sept derniers jours.",
              href: "/admin/press/rejections",
              icon: Newspaper,
            },
          ]}
          emptyLabel="Rien à signaler sur la période."
        />
      </section>
      <section aria-labelledby="activity-title" className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ActivityList title="Activité récente">
          <>
            {data.recentActivity.length ? (
              data.recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span className="flex-1 truncate text-sm">
                    {entry.action} <span className="text-muted-foreground">{entry.entityType}</span>
                  </span>
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={entry.createdAt.toISOString()}
                  >
                    {relativeTime(entry.createdAt)}
                  </time>
                </li>
              ))
            ) : (
              <li className="p-6 text-center text-sm text-muted-foreground">
                Aucune activité récente
              </li>
            )}
          </>
        </ActivityList>
        <ActivityList title="Activité et opérations">
          <Link href="/admin/syncs" className="text-sm text-muted-foreground hover:text-foreground">
            Voir les synchronisations
          </Link>
          {data.syncHistory.length ? (
            data.syncHistory.map((job) => (
              <li key={job.id} className="flex items-center gap-3 px-4 py-3">
                <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate font-mono text-xs">{job.script}</span>
                <Badge variant="outline">{job.status}</Badge>
              </li>
            ))
          ) : (
            <li className="p-6 text-center text-sm text-muted-foreground">
              Aucune synchronisation enregistrée
            </li>
          )}
        </ActivityList>
      </section>
    </>
  );
}

function ActivityList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">{children}</ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AdminDashboard() {
  const data = await getDashboardCounts();
  const cards: QueueCard[] = [
    {
      label: "Affaires DRAFT",
      count: data.affairsDraft,
      description: "Vérifier les sources et décider de la publication.",
      href: "/admin/affaires?status=DRAFT",
      icon: Scale,
    },
    {
      label: "Propositions en attente",
      count: data.queues.proposalsPending,
      description: "Examiner les modifications proposées.",
      href: "/admin/affaires/propositions?status=PENDING",
      icon: GitPullRequestArrow,
    },
    {
      label: "Propositions en conflit",
      count: data.queues.proposalsConflict,
      description: "Résoudre les écarts avec la donnée actuelle.",
      href: "/admin/affaires/propositions?status=CONFLICT",
      icon: ShieldAlert,
    },
    {
      label: "Revues de modération",
      count: data.queues.reviewsPending,
      description: "Appliquer ou écarter la recommandation, avec preuve.",
      href: "/admin/affaires?filter=moderation-pending",
      icon: FileCheck2,
    },
    {
      label: "Articles à lier",
      count: data.queues.articlesPending,
      description: "Examiner les articles analysés sans liaison d’affaire.",
      href: "/admin/liaisons/articles-affaires",
      icon: Newspaper,
    },
  ];
  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="À traiter maintenant"
        description={`${data.totalPoliticians} personnalités politiques, ${data.totalAffairs} affaires`}
        action={
          <Link
            href="/admin/affaires/nouveau"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "oklch(0.52 0.2 25)" }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouvelle affaire
          </Link>
        }
      />
      <section aria-labelledby="todo-title" className="space-y-4">
        <div>
          <h2 id="todo-title" className="font-display text-lg font-semibold">
            À traiter maintenant
          </h2>
          <p className="text-sm text-muted-foreground">
            Chaque compteur correspond à une file distincte et ouvre son filtre de travail.
          </p>
        </div>
        <QueueGrid cards={cards} emptyLabel="File vide, aucune action en attente." />
      </section>
      <section aria-labelledby="health-title" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="health-title" className="font-display text-lg font-semibold">
            Santé des données
          </h2>
          <span className="text-sm text-muted-foreground">{data.completeness}% complet</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              "Personnalités sans photo",
              data.politiciansWithoutPhoto,
              "/admin/politiques?filter=no-photo",
            ],
            ["Biographies manquantes", data.biographiesMissing, "/admin/politiques?filter=no-bio"],
            ["Affaires sans décision", data.affairsWithoutEcli, "/admin/affaires?filter=no-ecli"],
            ["Personnalités DRAFT", data.politiciansDraft, "/admin/politiques?status=DRAFT"],
          ].map(([label, count, href]) => (
            <Link key={String(label)} href={String(href)}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{String(count)}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{String(label)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
      <Suspense fallback={<DashboardSkeleton />}>
        <SecondaryDashboardSections />
      </Suspense>
    </div>
  );
}
