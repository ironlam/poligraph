import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HubMeasureContext } from "@/lib/data/hub";
import {
  presidentialReaderGuidePath,
  presidentialReaderGuidesPath,
} from "@/lib/presidentielle/reader-guide-paths";

export function HubReaderGuides({ guides }: { guides: HubMeasureContext["featuredReaderGuides"] }) {
  if (guides.length === 0) return null;
  return (
    <section aria-labelledby="hub-reader-guides" className="space-y-4">
      <div className="space-y-1.5">
        <h2 id="hub-reader-guides" className="font-display text-xl font-bold md:text-2xl">
          Comprendre les termes des programmes
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Définitions sourcées des sigles et dispositifs techniques présents dans les mesures
          publiées.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((guide) => (
          <li key={guide.slug}>
            <Link
              href={presidentialReaderGuidePath(guide.slug)}
              className="flex min-h-20 h-full flex-col justify-center rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/60 hover:bg-accent/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="font-bold text-primary">{guide.label}</span>
              <span className="mt-1 text-xs text-muted-foreground">
                {guide.measureCount} {guide.measureCount === 1 ? "mesure" : "mesures"} ·{" "}
                {guide.candidateCount} {guide.candidateCount === 1 ? "candidat" : "candidats"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={presidentialReaderGuidesPath()}
        className="inline-flex min-h-11 items-center gap-2 font-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Voir tout le glossaire
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </section>
  );
}
