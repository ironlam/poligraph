import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PresidentialOverviewStats } from "@/lib/data/presidential-stats";

const HUB_PATH = "/elections/presidentielle-2027";

export function PresidentialEntry({ stats }: { stats: PresidentialOverviewStats }) {
  const figures = [
    {
      value: stats.trackedCandidacyCount,
      label: "personnalités suivies",
    },
    {
      value: stats.documentedCandidacyCount,
      label: "avec des mesures publiées",
    },
    {
      value: stats.verifiedMeasureCount,
      label: "mesures publiées",
    },
    {
      value: stats.comparableThemeCount,
      label: "thèmes comparables",
    },
  ];

  return (
    <section
      aria-labelledby="presidential-entry-title"
      className="mt-12 border-t border-border pt-8"
    >
      <div className="rounded-2xl border border-border bg-card p-5 md:p-7">
        <p className="text-sm font-bold uppercase tracking-widest text-brand">
          Élection présidentielle 2027
        </p>
        <h2
          id="presidential-entry-title"
          className="mt-2 font-display text-2xl font-extrabold tracking-tight md:text-3xl"
        >
          Candidatures et mesures documentées
        </h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground-strong">
          Consultez les candidatures suivies par Poligraph, explorez les mesures publiées par thème
          et placez les propositions de deux ou trois candidats côte à côte.
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {figures.map((figure) => (
            <div
              key={figure.label}
              className="flex flex-col rounded-xl border border-border bg-background p-4"
            >
              <dt className="order-2 mt-1 text-sm leading-snug text-muted-foreground-strong">
                {figure.label}
              </dt>
              <dd className="order-1 font-display text-3xl font-extrabold tabular-nums text-primary">
                {figure.value.toLocaleString("fr-FR")}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm leading-relaxed">
          <p>
            <strong>
              {stats.probityCandidateCount === 0
                ? "Aucune personnalité suivie"
                : `${stats.probityCandidateCount} ${stats.probityCandidateCount === 1 ? "personnalité suivie" : "personnalités suivies"}`}
            </strong>{" "}
            {stats.probityCandidateCount === 0
              ? "n’a"
              : stats.probityCandidateCount === 1
                ? "a"
                : "ont"}{" "}
            au moins une condamnation documentée pour atteinte à la probité, prononcée au minimum en
            première instance.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ce nombre porte sur les personnes, pas sur le nombre d’affaires. Le statut précis de
            chaque procédure figure sur sa fiche.
          </p>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href={HUB_PATH}
            prefetch={false}
            className={cn(buttonVariants({ variant: "default" }), "min-h-11 justify-center")}
          >
            Voir le dossier présidentielle 2027
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link
            href={`${HUB_PATH}/comparer`}
            prefetch={false}
            className={cn(buttonVariants({ variant: "outline" }), "min-h-11 justify-center")}
          >
            Comparer les mesures des candidats
          </Link>
        </div>
      </div>
    </section>
  );
}
