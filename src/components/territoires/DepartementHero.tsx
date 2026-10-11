import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import { TerritoryShape } from "@/components/territoires/TerritoryShape";
import { DEPARTMENT_OUTLINES } from "@/config/territoires-shapes";
import {
  TERRITOIRES_PATH,
  territoireRegionPath,
  territoireDepartementPath,
} from "@/lib/territoires/paths";
import { COMMUNES_ANCHOR } from "@/lib/territoires/departement-communes";
import type { DepartementTerritoire } from "@/lib/data/territoires";
import { cn, formatDate } from "@/lib/utils";
import { SITE_URL } from "@/config/site";
import { remplaceLeDepartement } from "@/components/territoires/DepartementConseil";

interface DepartementHeroProps {
  slug: string;
  name: string;
  code: string;
  territoire: DepartementTerritoire;
  deputeCount: number;
  senateurCount: number;
}

function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return `${n.toLocaleString("fr-FR")} ${n > 1 ? pluralForm : singular}`;
}

export function DepartementHero({
  slug,
  name,
  code,
  territoire,
  deputeCount,
  senateurCount,
}: DepartementHeroProps) {
  const { region, territoireHorsRegion, collectivitesParticulieres, presidence } = territoire;
  const communesDate = territoire.coverage.find((c) => c.bloc === "communes")?.date ?? null;
  const replaced = remplaceLeDepartement(collectivitesParticulieres);
  const showPresidence = !territoireHorsRegion && !replaced;
  const title = `${name} (${code})`;
  const hasShape = Object.hasOwn(DEPARTMENT_OUTLINES, code);

  const crumbs: { label: string; href?: string }[] = [
    { label: "Territoires", href: TERRITOIRES_PATH },
    ...(region ? [{ label: region.name, href: territoireRegionPath(region.slug) }] : []),
    { label: title },
  ];

  const kicker = territoireHorsRegion ? (
    territoireHorsRegion.statut
  ) : (
    <>
      Département
      {region && <span className="max-sm:hidden"> · {region.name}</span>}
    </>
  );

  return (
    <section
      aria-labelledby="departement-titre"
      className="bg-[linear-gradient(135deg,#1e3a5f_0%,#0f1f3a_100%)] text-white"
    >
      <BreadcrumbJsonLd
        items={[{ label: "Accueil", href: "/" }, ...crumbs].map((c) => ({
          name: c.label,
          url: `${SITE_URL}${c.href ?? territoireDepartementPath(slug)}`,
        }))}
      />
      <div aria-hidden="true" className="flex h-1">
        <div className="flex-1 bg-[#14284a]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#d42a2a]" />
      </div>
      <div className="relative container mx-auto flex flex-wrap items-center gap-6 px-4 pt-4 pb-6 sm:gap-8 sm:pt-6 sm:pb-10">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-3 sm:gap-4">
          <nav
            aria-label="Fil d'Ariane"
            className={cn("text-sm text-[#c7d3e8]", hasShape && "pr-24 sm:pr-0")}
          >
            <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {crumbs.map((c, i) => (
                <li key={c.label} className="flex items-center gap-1.5">
                  {c.href ? (
                    <>
                      <Link
                        href={c.href}
                        prefetch={false}
                        className="inline-flex min-h-11 min-w-11 items-center text-white underline underline-offset-2 hover:text-[#dbe4f3] sm:min-h-0 sm:min-w-0"
                      >
                        {c.label}
                      </Link>
                      {i < crumbs.length - 1 && <span aria-hidden="true">›</span>}
                    </>
                  ) : (
                    <span aria-current="page" className="font-bold text-white max-sm:sr-only">
                      {c.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          <span
            className={cn(
              "self-start rounded-full border border-[#6f87b3] px-3 py-1 text-xs font-bold sm:text-sm",
              hasShape && "mr-24 sm:mr-0"
            )}
          >
            {kicker}
          </span>

          <h1
            id="departement-titre"
            className="font-display text-[2rem] leading-[1.05] font-extrabold tracking-tight sm:text-5xl"
          >
            {title}
          </h1>

          {collectivitesParticulieres.length > 0 && (
            <p className="max-w-2xl text-[#d6deeb] sm:text-lg">
              {replaced ? "Collectivité compétente : " : "Collectivité à statut particulier : "}
              {[...new Set(collectivitesParticulieres.map((c) => c.collectivite))].join(", ")}.{" "}
              <a
                href="#collectivite"
                className="text-white underline underline-offset-2 hover:text-[#dbe4f3]"
              >
                Voir la note
              </a>
            </p>
          )}

          <dl className="mt-1 grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
            {showPresidence && (
              <div className="flex flex-col gap-0.5 rounded-xl border border-[#4d6390] bg-white/5 px-3.5 py-3">
                <dt className="text-[13px] text-[#c7d3e8]">Présidence du département</dt>
                <dd className="font-display text-base font-bold sm:text-lg">
                  {presidence.state === "ETABLI" && presidence.person ? (
                    <Link
                      href={`/politiques/${presidence.person.slug}`}
                      prefetch={false}
                      className="inline-flex min-h-11 items-center underline underline-offset-2 sm:min-h-0"
                    >
                      {presidence.person.fullName}
                    </Link>
                  ) : (
                    "Non établie"
                  )}
                </dd>
                <dd className="text-xs text-[#c7d3e8]">
                  {presidence.state === "ETABLI"
                    ? presidence.source
                      ? `Source : ${presidence.source.label}`
                      : "Source non précisée dans nos données"
                    : "dans nos données"}
                </dd>
              </div>
            )}
            <div className="flex flex-col gap-0.5 rounded-xl border border-[#4d6390] bg-white/5 px-3.5 py-3">
              <dt className="text-[13px] text-[#c7d3e8]">Communes</dt>
              <dd className="font-display text-base font-bold tabular-nums sm:text-lg">
                {territoire.communeCount.toLocaleString("fr-FR")}
              </dd>
              <dd className="text-xs text-[#c7d3e8]">
                COG INSEE{communesDate ? `, import du ${formatDate(communesDate)}` : ""}
              </dd>
            </div>
            <div
              className={cn(
                "col-span-2 flex-col gap-0.5 rounded-xl border border-[#4d6390] bg-white/5 px-3.5 py-3 sm:col-span-1 sm:flex",
                showPresidence ? "hidden" : "flex"
              )}
            >
              <dt className="text-[13px] text-[#c7d3e8]">Au Parlement</dt>
              <dd className="font-display text-base font-bold sm:text-lg">
                {plural(deputeCount, "député")} · {plural(senateurCount, "sénateur")}
              </dd>
              <dd className="text-xs text-[#c7d3e8]">mandats en cours</dd>
            </div>
          </dl>

          <div className="hidden flex-wrap gap-2 sm:flex">
            <a
              href={`#${COMMUNES_ANCHOR}`}
              className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 font-bold text-[#14284a] hover:bg-[#e8edf5]"
            >
              Trouver une commune
            </a>
            <a
              href="#parlement"
              className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 font-bold text-[#14284a] hover:bg-[#e8edf5]"
            >
              Députés et sénateurs
            </a>
          </div>
        </div>

        {hasShape && <TerritoryHeroShape code={code} />}
      </div>
    </section>
  );
}

/** Silhouette plus a small France inset (metropolitan departments only). */
function TerritoryHeroShape({ code }: { code: string }) {
  return (
    <div
      aria-hidden="true"
      className="absolute top-4 right-4 w-[72px] sm:relative sm:top-auto sm:right-auto sm:w-auto sm:max-w-[320px] sm:flex-[1_1_260px]"
    >
      <TerritoryShape kind="departement" code={code} tone="marine" />
      <div className="absolute top-0 right-0 hidden w-20 sm:block">
        <TerritoryShape kind="france" size="mini" highlightDepartment={code} tone="marine" />
      </div>
    </div>
  );
}
