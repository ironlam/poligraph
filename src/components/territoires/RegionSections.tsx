import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { CoverageEntry, RegionTerritoire, SourceRef } from "@/lib/data/territoires";
import { formatDate } from "@/lib/utils";
import { formatCompte } from "@/lib/territoires/format";
import { TERRITOIRES_DONNEES_PATH, territoireDepartementPath } from "@/lib/territoires/paths";

const CARD = "rounded-xl border border-border bg-card p-4 sm:p-6";

function SourceLink({ source }: { source: SourceRef }) {
  if (!source.url) return <>{source.label}</>;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-4 hover:text-foreground"
    >
      {source.label}
      <span className="sr-only"> (site externe)</span>
    </a>
  );
}

/** Departments of the region, in alphabetical order (never ranked by a figure). */
export function RegionDepartements({ data }: { data: RegionTerritoire }) {
  return (
    <section aria-labelledby="departements-titre" className={CARD}>
      <h2 id="departements-titre" className="font-display text-xl font-extrabold text-primary">
        Départements
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Ordre alphabétique.</p>
      <ul className="mt-3 divide-y divide-border">
        {data.departements.map((d) => {
          const label = `${d.name ?? d.code} (${d.code})`;
          const detail = formatCompte(d.communeCount, "commune", "communes");
          return (
            <li key={d.code}>
              {d.slug ? (
                <Link
                  href={territoireDepartementPath(d.slug)}
                  prefetch={false}
                  className="flex min-h-11 items-center justify-between gap-3 py-3 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="min-w-0">
                    <span className="block font-bold">{label}</span>
                    <span className="block text-sm text-muted-foreground">{detail}</span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              ) : (
                <div className="py-3">
                  <span className="block font-bold">{label}</span>
                  <span className="block text-sm text-muted-foreground">{detail}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Where the competent authority differs from the ordinary region: a sourced note, nothing more. */
export function RegionCollectivites({ data }: { data: RegionTerritoire }) {
  if (data.collectivitesParticulieres.length === 0) return null;
  return (
    <section aria-labelledby="collectivite-titre" className={CARD}>
      <h2 id="collectivite-titre" className="font-display text-xl font-extrabold text-primary">
        Collectivité compétente
      </h2>
      <ul className="mt-3 space-y-4">
        {data.collectivitesParticulieres.map((c) => (
          <li key={c.id} id={c.id}>
            <p className="font-bold">{c.collectivite}</p>
            <p className="mt-1">{c.note}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Source : <SourceLink source={c.source} />
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface RegionElection {
  slug: string;
  title: string;
  round1Date: string | null;
}

export function RegionElections({ elections }: { elections: RegionElection[] }) {
  if (elections.length === 0) return null;
  return (
    <section aria-labelledby="elections-titre" className={CARD}>
      <h2 id="elections-titre" className="font-display text-xl font-extrabold text-primary">
        Élections
      </h2>
      <ul className="mt-3 divide-y divide-border">
        {elections.map((e) => (
          <li key={e.slug}>
            <Link
              href={`/elections/${e.slug}`}
              prefetch={false}
              className="flex min-h-11 items-center justify-between gap-3 py-3 hover:text-primary"
            >
              <span className="min-w-0">
                <span className="block font-bold">{e.title}</span>
                <span className="block text-sm text-muted-foreground">
                  {e.round1Date
                    ? `Premier tour le ${formatDate(e.round1Date)}`
                    : "Date du scrutin non encore fixée dans nos données"}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RegionParlement({ data }: { data: RegionTerritoire }) {
  return (
    <section aria-labelledby="parlement-titre" className={CARD}>
      <h2 id="parlement-titre" className="font-display text-lg font-extrabold text-primary">
        Au Parlement
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Députés et sénateurs sont élus dans le cadre du département.
      </p>
      <ul className="mt-2 divide-y divide-border">
        {data.departements
          .filter((d): d is typeof d & { slug: string } => d.slug !== null)
          .map((d) => {
            const parts = [
              d.deputeCount > 0 ? formatCompte(d.deputeCount, "député", "députés") : null,
              d.senateurCount > 0 ? formatCompte(d.senateurCount, "sénateur", "sénateurs") : null,
            ].filter(Boolean);
            return (
              <li key={d.code}>
                <Link
                  href={territoireDepartementPath(d.slug)}
                  prefetch={false}
                  className="flex min-h-11 flex-col justify-center py-2 hover:text-primary"
                >
                  <span className="font-medium">{d.name ?? d.code}</span>
                  <span className="text-sm text-muted-foreground">
                    {parts.length > 0
                      ? parts.join(", ")
                      : "Aucun parlementaire en fonction dans nos données"}
                  </span>
                </Link>
              </li>
            );
          })}
      </ul>
    </section>
  );
}

const COVERAGE_LABELS: Partial<Record<CoverageEntry["bloc"], string>> = {
  departements: "Départements et chef-lieu",
  communes: "Communes",
  presidence: "Présidence",
  conseil: "Composition du conseil",
};

function coverageText(entry: CoverageEntry): string {
  if (entry.state === "DISPONIBLE") {
    if (!entry.date) return "disponible";
    const verb = entry.bloc === "communes" ? "liste importée le" : "confirmée le";
    return `disponible, ${verb} ${formatDate(entry.date)}`;
  }
  return "non établie dans nos données";
}

/** What the page can and cannot say, block by block, with the source of each. */
export function RegionCouverture({ data }: { data: RegionTerritoire }) {
  return (
    <section aria-labelledby="couverture-titre" className={CARD}>
      <h2 id="couverture-titre" className="font-display text-lg font-extrabold text-primary">
        Informations disponibles
      </h2>
      <ul className="mt-2 space-y-2 text-sm">
        {data.coverage.map((entry) => {
          const label = COVERAGE_LABELS[entry.bloc];
          if (!label) return null;
          return (
            <li key={entry.bloc}>
              <span className="font-medium">{label}</span> : {coverageText(entry)}
              {entry.source && (
                <span className="block text-muted-foreground">
                  Source : <SourceLink source={entry.source} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function RegionReutiliser({ apiPath }: { apiPath: string }) {
  return (
    <section aria-labelledby="reutiliser-titre" className={CARD}>
      <h2 id="reutiliser-titre" className="font-display text-lg font-extrabold text-primary">
        Réutiliser
      </h2>
      <ul className="mt-2 text-sm">
        <li>
          <a
            href={apiPath}
            className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
          >
            Données de la région en JSON (API v1)
          </a>
        </li>
        <li>
          <Link
            href="/docs/api"
            prefetch={false}
            className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
          >
            Documentation de l{"'"}API
          </Link>
        </li>
        <li>
          <Link
            href={TERRITOIRES_DONNEES_PATH}
            prefetch={false}
            className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
          >
            Fichiers CSV et licences
          </Link>
        </li>
      </ul>
    </section>
  );
}
