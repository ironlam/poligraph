import Link from "next/link";
import { MapPin, ArrowRight } from "lucide-react";
import { HomeHeroSearch } from "./HomeHeroSearch";

export function HomeHero() {
  return (
    <section className="space-y-5">
      <div className="space-y-3">
        <h1 className="text-2xl font-display font-bold tracking-tight md:text-4xl">
          Comprendre la vie politique française par les faits
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
          Poligraph vous aide à explorer les représentants politiques, leurs votes, les affaires
          judiciaires documentées, les fact-checks et les données publiques.
        </p>
      </div>

      <div className="max-w-xl space-y-2">
        <HomeHeroSearch />
        <Link
          href="/mon-depute"
          className="group inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-primary"
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Trouver mon député
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </div>
    </section>
  );
}
