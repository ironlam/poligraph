import Link from "next/link";
import type { MeasureEnrichmentCoverage } from "../_data/enrichment-coverage-query";

function percentage(value: number, total: number): string {
  if (total === 0) return "0 %";
  return `${Math.round((value / total) * 100)} %`;
}

const METRICS: Array<{
  key: Exclude<keyof MeasureEnrichmentCoverage, "total">;
  label: string;
  help: string;
}> = [
  {
    key: "withDetails",
    label: "Contexte rédigé",
    help: "La fiche explique ce que prévoit la mesure à partir de sa source.",
  },
  {
    key: "withApprovedSubtopics",
    label: "Sous-thèmes validés",
    help: "Au moins un rattachement éditorial validé.",
  },
  {
    key: "withSourceLocation",
    label: "Source localisée",
    help: "Au moins une page ou une section est indiquée dans la source.",
  },
  {
    key: "withQualifications",
    label: "Qualifications",
    help: "Au moins une conclusion éditoriale datée et justifiée.",
  },
  {
    key: "withVoteLinks",
    label: "Votes rapprochés",
    help: "Au moins un rapprochement parlementaire a été vérifié.",
  },
  {
    key: "withHistory",
    label: "Historique",
    help: "La mesure est reliée à une formulation antérieure ou ultérieure.",
  },
];

export function EnrichmentCoveragePanel({ coverage }: { coverage: MeasureEnrichmentCoverage }) {
  const missingDetails = Math.max(0, coverage.total - coverage.withDetails);

  return (
    <section aria-labelledby="coverage-heading" className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="coverage-heading" className="font-display text-lg font-bold">
            Couverture des fiches publiques 2027
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground-strong">
            Compteurs exacts sur {coverage.total.toLocaleString("fr-FR")} mesures actuellement
            visibles. Ils ne dépendent ni des filtres ni de la limite de la file de modération.
          </p>
        </div>
        {missingDetails > 0 ? (
          <Link
            href="/admin/mesures?enrichissement=DETAILS_MISSING"
            prefetch={false}
            className="inline-flex min-h-11 items-center rounded border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Compléter {missingDetails.toLocaleString("fr-FR")} contextes
          </Link>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {METRICS.map((metric) => {
          const value = coverage[metric.key];
          return (
            <div key={metric.key} className="rounded-md bg-muted/50 p-3">
              <dt className="text-sm font-medium">{metric.label}</dt>
              <dd className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold">
                  {value.toLocaleString("fr-FR")}
                </span>
                <span className="text-sm text-muted-foreground">
                  {percentage(value, coverage.total)}
                </span>
              </dd>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{metric.help}</p>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
