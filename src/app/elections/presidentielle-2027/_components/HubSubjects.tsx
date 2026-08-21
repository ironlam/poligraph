import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { THEME_ACCENT_BAR } from "@/config/labels";
import type { HubTheme } from "@/lib/data/hub";

/**
 * The thirteen subjects, named on the hub home instead of hidden behind a single card.
 *
 * The home used to hand the reader two buttons and nothing else once the candidacy field moved to
 * its own page. A reader who lands here has a subject in mind (le logement, la santé), not a route,
 * so the hub names them and links each one directly.
 *
 * No measure counter per subject, on purpose: the index page counts "mesures documentées"
 * (withdrawals included) while the hub header counts the currently defended ones. The same subject
 * would carry two numbers on two pages with nothing explaining the gap, so the count stays where
 * its definition is written, and the link to the index is right here in the heading.
 *
 * "Comparaison ouverte" is the same vocabulary as `HubClosedState`, and the closed subjects are
 * still linked: their page says what is missing to open them, which is worth reading.
 */
export function HubSubjects({ themes }: { themes: HubTheme[] }) {
  const openCount = themes.filter((theme) => theme.publishable).length;

  return (
    <section aria-labelledby="hub-sujets" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="hub-sujets" className="font-display text-xl font-bold tracking-tight md:text-2xl">
          Les {themes.length} sujets suivis
        </h2>
        <Link
          href="/elections/presidentielle-2027/sujets"
          prefetch={false}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          Voir l&apos;index des sujets
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>

      <p className="max-w-3xl text-sm text-muted-foreground">
        {openCount === 0
          ? "Aucun sujet n'est encore ouvert à la comparaison. Chaque page indique les propositions déjà publiées et ce qui manque pour l'ouvrir."
          : `${openCount} ${openCount === 1 ? "sujet est ouvert" : "sujets sont ouverts"} à la comparaison. Les autres indiquent les propositions déjà publiées et ce qui manque pour les ouvrir.`}
      </p>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((theme) => (
          <li key={theme.theme}>
            <Link
              href={`/elections/presidentielle-2027/sujets/${theme.slug}`}
              prefetch={false}
              className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 transition-colors hover:border-primary hover:bg-muted/40"
            >
              <span
                aria-hidden="true"
                className={`h-7 w-1 shrink-0 rounded-full ${THEME_ACCENT_BAR[theme.theme]}`}
              />
              <span className="min-w-0 flex-1 text-sm font-medium">{theme.label}</span>
              {theme.publishable && (
                <span className="shrink-0 rounded-full border border-primary/40 px-2 py-0.5 text-xs font-semibold text-primary">
                  Comparaison ouverte
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
