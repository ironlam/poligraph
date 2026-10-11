import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { TerritoiresEntry } from "@/lib/data/territoires";
import { DEPARTMENTS, getDepartmentSlug } from "@/config/departments";
import { territoireRegionPath, territoireDepartementPath } from "@/lib/territoires/paths";
import { formatDate } from "@/lib/utils";
import { formatCompte, formatNombre } from "@/lib/territoires/format";

type EntryRegion = TerritoiresEntry["regions"][number];

function RegionLink({ region }: { region: EntryRegion }) {
  return (
    <li>
      <Link
        href={territoireRegionPath(region.slug)}
        prefetch={false}
        className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/40 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="min-w-0">
          <span className="block font-bold">{region.name}</span>
          <span className="block text-sm text-muted-foreground">
            {formatCompte(region.departementCount, "département", "départements")} ·{" "}
            {formatCompte(region.communeCount, "commune", "communes")}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * Text list of every region, the real navigation of the section. The map in the banner is a mouse
 * shortcut only (`TerritoryShape` keeps its links out of the tab order and the accessibility tree).
 */
export function EntreeRegions({ entry }: { entry: TerritoiresEntry }) {
  const metropole = entry.regions.filter((r) => !r.outreMer);
  const outreMer = entry.regions.filter((r) => r.outreMer);

  return (
    <section id="regions" aria-labelledby="regions-titre" className="scroll-mt-24">
      <h2 id="regions-titre" className="font-display text-2xl font-extrabold">
        Explorer par région
      </h2>
      <div className="mt-4 space-y-6">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Métropole
          </h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {metropole.map((r) => (
              <RegionLink key={r.code} region={r} />
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Outre-mer
          </h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {outreMer.map((r) => (
              <RegionLink key={r.code} region={r} />
            ))}
          </ul>
        </div>

        {entry.horsRegion.length > 0 && (
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Collectivités et territoires d{"'"}outre-mer sans région
            </h3>
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
              {entry.horsRegion.map((t) => {
                const slug = DEPARTMENTS[t.code] ? getDepartmentSlug(t.name) : null;
                return (
                  <li
                    key={t.code}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="font-bold">{t.name}</span>
                      <span className="text-muted-foreground"> · {t.statut}</span>
                    </span>
                    {slug && t.communeCount > 0 ? (
                      <Link
                        href={territoireDepartementPath(slug)}
                        prefetch={false}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {t.communeCount > 1
                          ? `Voir les ${formatCompte(t.communeCount, "commune", "communes")}`
                          : "Voir la commune"}
                        <span className="sr-only"> de {t.name}</span>
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/** Real coverage of the section, computed from the base: never a placeholder. */
export function CouvertureEntree({ national }: { national: TerritoiresEntry["national"] }) {
  return (
    <p className="text-sm text-muted-foreground">
      Données disponibles pour {formatNombre(national.communeCount)} communes ; maire établi pour{" "}
      {formatNombre(national.mairesEtablis)} d{"'"}entre elles.
      {national.importedAt && (
        <> Liste des communes importée le {formatDate(national.importedAt)}.</>
      )}{" "}
      Source :{" "}
      {national.source.url ? (
        <a
          href={national.source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          {national.source.label}
          <span className="sr-only"> (site externe)</span>
        </a>
      ) : (
        national.source.label
      )}
      .
    </p>
  );
}
