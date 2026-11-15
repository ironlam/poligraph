import Link from "next/link";
import { COMPETENCES_SOURCE } from "@/config/territoires-competences";
import { LigneSource } from "@/components/territoires/LigneSource";
import type { Barreau } from "@/lib/territoires/echelle";
import { formatDateFrUTC } from "@/lib/utils";

/**
 * « Échelle des territoires »: the levels a place belongs to, from the nearest up, with what
 * the law gives each one. A vertical rail, every rung with a page being a link.
 */
export function EchelleTerritoires({ barreaux }: { barreaux: Barreau[] }) {
  if (barreaux.length === 0) return null;
  return (
    <section aria-labelledby="echelle-titre" className="rounded-2xl border bg-card p-5">
      <h2 id="echelle-titre" className="mb-3 font-display text-lg font-bold text-primary">
        Qui s{"'"}occupe de quoi
      </h2>
      <ol>
        {barreaux.map((b, i) => (
          <li
            key={`${b.niveau}-${b.nom}`}
            aria-current={b.ici ? "true" : undefined}
            className="relative flex gap-3 pb-4 last:pb-0"
          >
            {/* Rail and dot are decoration: the order of the list carries the hierarchy. */}
            <span aria-hidden="true" className="relative flex w-3 shrink-0 justify-center">
              {i < barreaux.length - 1 && (
                <span className="absolute -bottom-4 top-4 w-0.5 bg-primary/20" />
              )}
              <span
                className={`relative mt-1 h-3 w-3 rounded-full border-2 border-primary ${b.ici ? "bg-primary" : "bg-card"}`}
              />
            </span>
            <div className="min-w-0 text-sm">
              <p className="text-xs text-muted-foreground">
                {b.titre}
                {b.ici && " · cette page"}
              </p>
              <p className="font-semibold">
                {b.href ? (
                  <Link
                    href={b.href}
                    prefetch={false}
                    className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-primary"
                  >
                    {b.nom}
                  </Link>
                ) : (
                  b.nom
                )}
              </p>
              {b.competences && <p>{b.competences}</p>}
            </div>
          </li>
        ))}
      </ol>
      <LigneSource
        className="mt-4"
        periode={`Vérifié le ${formatDateFrUTC(COMPETENCES_SOURCE.checkedAt)}`}
        sources={[COMPETENCES_SOURCE]}
      />
    </section>
  );
}
