import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HubCandidacy } from "@/lib/data/hub";
import {
  CANDIDACY_FILTERS,
  CANDIDACY_FILTER_LABELS,
  matchesCandidacyFilter,
  matchesPublishedProposals,
} from "@/lib/presidentielle/candidacy-filters";

/**
 * The state of the field on the hub home, now that the field itself lives on `/candidats`.
 *
 * The home kept a single card carrying one summary sentence, which said how many people are
 * followed without letting the reader act on any part of it. The same numbers become the entry
 * points here: each one opens the list already filtered, on the very chips that list renders.
 *
 * The counts are computed with `matchesCandidacyFilter` and `matchesPublishedProposals`, the same
 * predicates the browser uses, so the hub can never announce a number the filtered page then
 * contradicts. A count of zero is rendered as plain text rather than a link: a filter with no
 * result is a dead end, and offering it as a destination promises something to read.
 */
export function HubCandidacyOverview({ candidacies }: { candidacies: HubCandidacy[] }) {
  const total = candidacies.length;
  const tiles = [
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
    <section aria-labelledby="hub-candidatures" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2
          id="hub-candidatures"
          className="font-display text-xl font-bold tracking-tight md:text-2xl"
        >
          Le champ des candidatures
        </h2>
        <Link
          href="/elections/presidentielle-2027/candidats"
          prefetch={false}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          {total === 1 ? "Voir la personne suivie" : `Voir les ${total} personnes suivies`}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>

      {total === 0 ? (
        <p className="max-w-3xl text-sm text-muted-foreground">
          Aucune candidature sourcée à ce jour.
        </p>
      ) : (
        <>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Chaque personne suivie porte son statut public et la source qui l&apos;établit.
            L&apos;ordre est alphabétique, sans classement.
          </p>
          <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {tiles.map((tile) => {
              const content = (
                <>
                  <span className="font-display text-2xl font-extrabold tracking-tight text-primary">
                    {tile.count}
                  </span>
                  <span className="text-sm text-muted-foreground-strong">{tile.label}</span>
                </>
              );

              return (
                <li key={tile.key}>
                  {tile.count === 0 ? (
                    <p className="flex h-full min-h-11 flex-col gap-1 rounded-xl border border-dashed border-border px-3 py-3">
                      {content}
                    </p>
                  ) : (
                    <Link
                      href={tile.href}
                      prefetch={false}
                      className="flex h-full min-h-11 flex-col gap-1 rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:border-primary hover:bg-muted/40"
                    >
                      {content}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
