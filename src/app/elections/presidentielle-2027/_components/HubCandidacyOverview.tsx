import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HubCandidacy } from "@/lib/data/hub";
import {
  CANDIDACY_FILTERS,
  CANDIDACY_FILTER_LABELS,
  matchesCandidacyFilter,
  matchesPublishedProposals,
} from "@/lib/presidentielle/candidacy-filters";
import { CandidacyDirectoryLink } from "./CandidacyDirectoryLink";

/**
 * The people followed by Poligraph, directly on the hub rather than reduced to four counters.
 * The same public field powers the directory, so names, statuses and filters cannot drift.
 */
export function HubCandidacyOverview({ candidacies }: { candidacies: HubCandidacy[] }) {
  const total = candidacies.length;
  const candidaciesWithPublishedProposals = candidacies.filter((candidacy) =>
    matchesPublishedProposals(candidacy, true)
  );
  const publishedTotal = candidaciesWithPublishedProposals.length;
  const filters = [
    ...CANDIDACY_FILTERS.filter((key) => key !== "toutes").map((key) => ({
      key,
      label: CANDIDACY_FILTER_LABELS[key],
      count: candidacies.filter((candidacy) => matchesCandidacyFilter(candidacy, key)).length,
      href: `/elections/presidentielle-2027/candidats?statut=${key}`,
    })),
    {
      key: "publiees" as const,
      label: "Avec des propositions publiées",
      count: candidacies.filter((candidacy) => matchesPublishedProposals(candidacy, true)).length,
      href: "/elections/presidentielle-2027/candidats?propositions=publiees",
    },
  ];

  return (
    <section id="candidatures" aria-labelledby="hub-candidatures" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="space-y-1.5">
          <h2
            id="hub-candidatures"
            className="font-display text-xl font-bold tracking-tight md:text-2xl"
          >
            {publishedTotal} {publishedTotal === 1 ? "personnalité a" : "personnalités ont"} déjà
            des propositions publiées
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            L&apos;accueil montre les personnalités pour lesquelles des mesures sont déjà
            documentées. L&apos;annuaire rassemble les {total} personnalités suivies, y compris
            celles dont les propositions restent à documenter.
          </p>
        </div>
        {total > 0 && (
          <Link
            href="/elections/presidentielle-2027/candidats"
            prefetch={false}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Explorer {total === 1 ? "la personnalité suivie" : `les ${total} personnalités`}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        )}
      </div>

      {publishedTotal === 0 ? (
        <p className="max-w-3xl text-sm text-muted-foreground">
          Aucune proposition publiée à ce jour.
        </p>
      ) : (
        <>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {candidaciesWithPublishedProposals.map((candidacy) => (
              <li key={candidacy.id}>
                <CandidacyDirectoryLink candidacy={candidacy} />
              </li>
            ))}
          </ul>

          <nav aria-label="Explorer l'annuaire des personnalités" className="flex flex-wrap gap-2">
            <span className="self-center text-xs text-muted-foreground-strong">
              Explorer l&apos;annuaire :
            </span>
            {filters
              .filter((filter) => filter.count > 0)
              .map((filter) => (
                <Link
                  key={filter.key}
                  href={filter.href}
                  prefetch={false}
                  className="inline-flex min-h-11 items-center rounded-full border border-border px-3.5 text-xs font-medium hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {filter.label} · {filter.count}
                </Link>
              ))}
          </nav>
        </>
      )}
    </section>
  );
}
