import Link from "next/link";
import { MapPin, ArrowRight } from "lucide-react";
import { HomeHeroSearch } from "./HomeHeroSearch";

export function HomeHero() {
  return (
    <section className="space-y-3 sm:space-y-5">
      <div className="space-y-3">
        <h1 className="text-2xl font-display font-bold tracking-tight md:text-4xl">
          Comprendre la vie politique française par les faits
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground max-sm:sr-only md:text-base">
          Poligraph vous aide à explorer les représentants politiques, leurs votes, les affaires
          judiciaires documentées, les fact-checks et les données publiques.
        </p>
      </div>

      <div className="max-w-xl space-y-3">
        <HomeHeroSearch />
        {/* A full row, not a line of text: it is the second thing a visitor comes for, and a
            bare link under the search field read as a footnote. */}
        <Link
          href="/mon-depute"
          className="group flex min-h-14 items-center gap-3 rounded-xl border bg-card p-2.5 pr-3 outline-none transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <MapPin className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-tight">Trouver mon député</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Par code postal ou géolocalisation
            </span>
          </span>
          <ArrowRight
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </Link>
      </div>
    </section>
  );
}
