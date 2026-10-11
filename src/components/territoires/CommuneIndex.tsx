import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DepartementTerritoire } from "@/lib/data/territoires";
import { territoireCommunePath } from "@/lib/territoires/paths";
import {
  COMMUNE_INDEX_LETTERS,
  COMMUNES_ANCHOR,
  departementCommunesHref,
} from "@/lib/territoires/departement-communes";
import { COMMUNE_POPULATION_SOURCE } from "@/config/communes";
import { DATA_SOURCE_URLS } from "@/config/labels";
import { cn, formatDate } from "@/lib/utils";
import { populationVintageLabel } from "@/lib/territoires/population-label";

interface CommuneIndexProps {
  slug: string;
  territoire: DepartementTerritoire;
}

/** "Communes 51 à 100 sur 84 commençant par M": always the active filter, never the whole list. */
export function communeListCounter(communes: DepartementTerritoire["communes"]): string {
  const { letter, page, pageSize, total, rows } = communes;
  const scope = letter ? ` commençant par ${letter}` : "";
  if (total === 0 || rows.length === 0) {
    return letter ? `Aucune commune${scope}` : "Aucune commune";
  }
  if (rows.length === total) {
    return `${total.toLocaleString("fr-FR")} commune${total > 1 ? "s" : ""}${scope}`;
  }
  const from = (page - 1) * pageSize + 1;
  const to = from + rows.length - 1;
  return `Communes ${from.toLocaleString("fr-FR")} à ${to.toLocaleString("fr-FR")} sur ${total.toLocaleString("fr-FR")}${scope}`;
}

/** Pages to show: first, last, and the current one with its neighbours. 0 marks a gap. */
export function paginationWindow(page: number, totalPages: number): number[] {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  return pages.flatMap((p, i) => (i > 0 && p - pages[i - 1]! > 1 ? [0, p] : [p]));
}

const CELL =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 font-bold tabular-nums";

export function CommuneIndex({ slug, territoire }: CommuneIndexProps) {
  const { communes, letterCounts, communeCount, populationVintages } = territoire;
  const { letter, page, totalPages, rows } = communes;
  const href = (query: { letter: string | null; page: number }) =>
    departementCommunesHref(slug, query);
  const importDate = territoire.coverage.find((c) => c.bloc === "communes")?.date ?? null;

  return (
    <section
      id={COMMUNES_ANCHOR}
      aria-labelledby="communes-titre"
      className="flex scroll-mt-20 flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="communes-titre"
          className="font-display text-xl font-extrabold sm:text-2xl text-primary"
        >
          {communeCount > 1
            ? `Les ${communeCount.toLocaleString("fr-FR")} communes`
            : communeCount === 1
              ? "La commune"
              : "Communes"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Ordre alphabétique, avec la population municipale et le maire en fonction.
        </p>
      </div>

      {/* A list that fits on one page needs no index. */}
      {communeCount > communes.pageSize && (
        <nav aria-label="Communes par initiale">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1">
            <li className="col-span-2">
              <Link
                href={href({ letter: null, page: 1 })}
                prefetch={false}
                aria-current={letter === null ? "page" : undefined}
                className={cn(
                  CELL,
                  "w-full",
                  letter === null
                    ? "bg-[#14284a] text-white"
                    : "bg-muted text-primary hover:bg-accent"
                )}
              >
                Toutes
              </Link>
            </li>
            {COMMUNE_INDEX_LETTERS.map((l) => {
              const count = letterCounts[l] ?? 0;
              const active = l === letter;
              return (
                <li key={l}>
                  {count > 0 ? (
                    <Link
                      href={href({ letter: l, page: 1 })}
                      prefetch={false}
                      aria-current={active ? "page" : undefined}
                      aria-label={`${l} : ${count} commune${count > 1 ? "s" : ""}`}
                      className={cn(
                        CELL,
                        "w-full",
                        active ? "bg-[#14284a] text-white" : "bg-muted text-primary hover:bg-accent"
                      )}
                    >
                      {l}
                    </Link>
                  ) : (
                    <span className={cn(CELL, "w-full font-normal text-muted-foreground/60")}>
                      {l}
                      <span className="sr-only"> : aucune commune</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {rows.length > 0 ? (
        <ul className="overflow-hidden rounded-xl border">
          {rows.map((c) => (
            <li key={c.inseeCode} className="border-b last:border-b-0">
              <Link
                href={territoireCommunePath(c.inseeCode)}
                prefetch={false}
                className="flex min-h-13 items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-bold">{c.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {[
                      c.population != null ? `${c.population.toLocaleString("fr-FR")} hab.` : null,
                      c.maire.state === "ETABLI" && c.maire.person
                        ? `Maire : ${c.maire.person.fullName}`
                        : c.maire.state === "NON_ETABLI"
                          ? "Maire non établi"
                          : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border bg-muted/40 p-4 text-sm">
          {letter
            ? `Aucune commune de ce département ne commence par ${letter}.`
            : "Aucune commune enregistrée pour ce territoire."}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{communeListCounter(communes)}</p>
        {totalPages > 1 && (
          <nav aria-label="Pages de la liste des communes">
            <ul className="flex flex-wrap items-center gap-1">
              {page > 1 && (
                <li>
                  <Link
                    href={href({ letter, page: page - 1 })}
                    prefetch={false}
                    rel="prev"
                    aria-label="Page précédente"
                    title="Page précédente"
                    className={cn(CELL, "border hover:bg-muted")}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </li>
              )}
              {paginationWindow(page, totalPages).map((p, i) =>
                p === 0 ? (
                  <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted-foreground">
                    …
                  </li>
                ) : (
                  <li key={p}>
                    <Link
                      href={href({ letter, page: p })}
                      prefetch={false}
                      aria-current={p === page ? "page" : undefined}
                      aria-label={`Page ${p}`}
                      className={cn(
                        CELL,
                        p === page ? "bg-[#14284a] text-white" : "border hover:bg-muted"
                      )}
                    >
                      {p}
                    </Link>
                  </li>
                )
              )}
              {page < totalPages && (
                <li>
                  <Link
                    href={href({ letter, page: page + 1 })}
                    prefetch={false}
                    rel="next"
                    aria-label="Page suivante"
                    title="Page suivante"
                    className={cn(CELL, "border hover:bg-muted")}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        )}
      </div>

      <p className="border-t pt-3 text-xs text-muted-foreground">
        Liste des communes : code officiel géographique (INSEE)
        {importDate ? `, import du ${formatDate(importDate)}` : ""}. Population :{" "}
        {populationVintages.length > 0 ? (
          populationVintages.map((v, i) => (
            <span key={`${v.millesime}-${v.producer}`}>
              {i > 0 && " ; "}
              <a
                href={v.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {populationVintageLabel(v)}
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
              {populationVintages.length > 1 &&
                ` pour ${v.communes.toLocaleString("fr-FR")} commune${v.communes > 1 ? "s" : ""}`}
            </span>
          ))
        ) : (
          <a
            href={COMMUNE_POPULATION_SOURCE.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
            aria-label={`${COMMUNE_POPULATION_SOURCE.label}, via ${COMMUNE_POPULATION_SOURCE.via} (nouvel onglet)`}
          >
            {COMMUNE_POPULATION_SOURCE.label}, via {COMMUNE_POPULATION_SOURCE.via}
          </a>
        )}
        . Maires :{" "}
        <a
          href={DATA_SOURCE_URLS.RNE}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
          aria-label="Répertoire national des élus (nouvel onglet)"
        >
          Répertoire national des élus
        </a>{" "}
        et résultats des municipales 2026 ; seuls les profils publiés sont nommés.
      </p>
    </section>
  );
}
