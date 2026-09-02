import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { THEME_ACCENT_BAR } from "@/config/labels";
import { PUBLICATION_GATES } from "@/config/publication-gates";
import type { HubTheme } from "@/lib/data/hub";

/**
 * The thirteen subjects, named on the hub home instead of hidden behind a single card.
 *
 * The home used to hand the reader two buttons and nothing else once the candidacy field moved to
 * its own page. A reader who lands here has a subject in mind (le logement, la santé), not a route,
 * so the hub names them and links each one directly.
 *
 * No counter or repeated badge per card: the section heading carries the number of comparable
 * subjects once. Closed subjects stay linked because their page explains what is missing.
 */
export function HubSubjects({ themes }: { themes: HubTheme[] }) {
  const openCount = themes.filter((theme) => theme.publishable).length;
  const required = PUBLICATION_GATES.pageSujet.minCandidaciesWithVerifiedMeasure;
  const heading = `${openCount} ${openCount === 1 ? "thématique peut" : "thématiques peuvent"} déjà être comparée${openCount === 1 ? "" : "s"}`;

  return (
    <section aria-labelledby="hub-sujets" className="space-y-4">
      <div className="space-y-1.5">
        <h2 id="hub-sujets" className="font-display text-xl font-bold tracking-tight md:text-2xl">
          {heading}
        </h2>

        <p className="max-w-3xl text-sm text-muted-foreground">
          Une thématique s&apos;ouvre à la comparaison quand au moins {required} candidatures y
          portent une mesure sourcée et relue.
        </p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((theme) => (
          <li key={theme.theme}>
            <Link
              href={`/elections/presidentielle-2027/themes/${theme.slug}`}
              prefetch={false}
              className="flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary hover:bg-muted/40 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              <span
                aria-hidden="true"
                className={`h-7 w-1 shrink-0 rounded-full ${THEME_ACCENT_BAR[theme.theme]}`}
              />
              <span className="min-w-0 flex-1 text-sm font-medium">{theme.label}</span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
