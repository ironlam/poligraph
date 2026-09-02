import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HubCandidacy } from "@/lib/data/hub";
import { matchesPublishedProposals } from "@/lib/presidentielle/candidacy-filters";
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

  return (
    <section id="candidatures" aria-labelledby="hub-candidatures" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="space-y-1.5">
          <h2
            id="hub-candidatures"
            className="font-display text-xl font-bold tracking-tight md:text-2xl"
          >
            Candidats et candidates déjà documentés
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {publishedTotal} {publishedTotal === 1 ? "personne a" : "personnes ont"} des
            propositions publiées. L&apos;annuaire rassemble les {total} candidatures suivies.
          </p>
        </div>
        {total > 0 && (
          <Link
            href="/elections/presidentielle-2027/candidats"
            prefetch={false}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Voir {total === 1 ? "la candidature" : `les ${total} candidatures`}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        )}
      </div>

      {publishedTotal === 0 ? (
        <p className="max-w-3xl text-sm text-muted-foreground">
          Aucune proposition publiée à ce jour.
        </p>
      ) : (
        <div
          role="region"
          aria-label="Candidats et candidates avec des propositions publiées"
          tabIndex={0}
          className="-mx-4 overflow-x-auto px-4 pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:mx-0 sm:px-0"
        >
          <ul className="flex w-max snap-x snap-mandatory gap-3">
            {candidaciesWithPublishedProposals.map((candidacy) => (
              <li key={candidacy.id} className="w-[min(19rem,82vw)] shrink-0 snap-start sm:w-72">
                <CandidacyDirectoryLink candidacy={candidacy} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
