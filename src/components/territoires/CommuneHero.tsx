import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BRAND_NAVY, BRAND_PAGE, BRAND_RED } from "@/config/brand";
import { SITE_URL } from "@/config/site";
import { DEPARTMENT_OUTLINES, FRANCE_MINI_OUTLINE } from "@/config/territoires-shapes";
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import { TerritoryShape } from "@/components/territoires/TerritoryShape";
import type { CommuneDossier } from "@/lib/data/territoires";
import {
  availableInformation,
  deputeNoun,
  formatCirconscription,
  formatPopulation,
  maireSince,
  territoireLabel,
} from "@/lib/territoires/commune-display";
import {
  TERRITOIRES_PATH,
  territoireRegionPath,
  territoireDepartementPath,
} from "@/lib/territoires/paths";
import { formatDate } from "@/lib/utils";
import { populationVintageLabel } from "@/lib/territoires/population-label";

/**
 * Navy banner of the Territoires commune page. Always navy with light text, in both themes: the
 * colours come from the brand constants, not from theme tokens that flip in dark mode.
 *
 * On a phone the mayor (or the state of the office) is the first fact read, before population and
 * Parliament: the facts are in that order in the DOM and stack in one column.
 */

interface Crumb {
  label: string;
  href?: string;
}

function crumbsFor(identity: CommuneDossier["identity"]): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Territoires", href: TERRITOIRES_PATH }];
  if (identity.region) {
    crumbs.push({ label: identity.region.name, href: territoireRegionPath(identity.region.slug) });
  } else if (identity.territoireHorsRegion) {
    crumbs.push({ label: "Outre-mer" });
  }
  crumbs.push({
    label: territoireLabel(identity),
    href: identity.department.slug
      ? territoireDepartementPath(identity.department.slug)
      : undefined,
  });
  crumbs.push({ label: identity.name });
  return crumbs;
}

function HeroBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const linked = crumbs.filter((c) => c.href);
  return (
    <>
      <BreadcrumbJsonLd
        items={linked.map((c) => ({ name: c.label, url: `${SITE_URL}${c.href}` }))}
      />
      <nav aria-label="Fil d'Ariane" className="text-sm text-white/85">
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {isLast ? (
                  <span className="font-semibold text-white" aria-current="page">
                    {crumb.label}
                  </span>
                ) : crumb.href ? (
                  <Link
                    href={crumb.href}
                    prefetch={false}
                    className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:min-h-0"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

function Fact({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-white/20 bg-white/5 px-4 py-3 ${emphasis ? "sm:col-span-2 lg:col-span-1" : ""}`}
    >
      <dt className="text-xs text-white/80">{label}</dt>
      <dd className="mt-1">
        <span className="block font-display text-lg font-bold leading-snug text-white">
          {value}
        </span>
        {detail && <span className="mt-1 block text-xs text-white/80">{detail}</span>}
      </dd>
    </div>
  );
}

function MaireFact({ maire }: { maire: CommuneDossier["maire"] }) {
  if (maire.state === "ETABLI" && maire.person) {
    const since = maireSince(maire);
    const detail = [since ? `depuis le ${formatDate(since)}` : null, maire.source?.label ?? null]
      .filter(Boolean)
      .join(" · ");
    return (
      <Fact
        emphasis
        label="Maire"
        value={
          <Link
            href={`/politiques/${maire.person.slug}`}
            prefetch={false}
            className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-white/90 sm:min-h-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {maire.person.fullName}
          </Link>
        }
        detail={detail || undefined}
      />
    );
  }
  if (maire.state === "NON_ETABLI") {
    return (
      <Fact
        emphasis
        label="Maire"
        value="Titulaire non établi"
        detail="Les données enregistrées ne permettent pas de le désigner avec certitude."
      />
    );
  }
  return (
    <Fact
      emphasis
      label="Maire"
      value="Non renseigné"
      detail="Aucun maire en fonction n'est enregistré pour cette commune."
    />
  );
}

function ParlementFact({ deputes }: { deputes: CommuneDossier["parlement"]["deputes"] }) {
  if (deputes.couvertureCirconscriptions === "PLUSIEURS") {
    return (
      <Fact
        label="Au Parlement"
        value="Plusieurs circonscriptions"
        detail="La circonscription dépend de l'adresse, voir ci-dessous."
      />
    );
  }
  const circo = deputes.circonscriptionEnregistree;
  if (circo == null) {
    return (
      <Fact
        label="Au Parlement"
        value="Circonscription non renseignée"
        detail="La circonscription dépend de l'adresse, voir ci-dessous."
      />
    );
  }
  const depute = deputes.state === "DISPONIBLE" ? deputes.deputes[0] : undefined;
  if (!depute) {
    // Not established: the recorded constituency is shown as such, and no one is named as
    // the commune's deputy here (the section below names them with the reservation).
    return (
      <Fact
        label="Au Parlement"
        value={`${formatCirconscription(circo)} enregistrée`}
        detail="Selon l'adresse, vérifiez avec Mon député, voir ci-dessous."
      />
    );
  }
  const noun = deputeNoun(depute.civility);
  return (
    <Fact
      label="Au Parlement"
      value={formatCirconscription(circo)}
      detail={
        noun
          ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} : ${depute.fullName}`
          : `À l'Assemblée nationale : ${depute.fullName}`
      }
    />
  );
}

export function CommuneHero({ dossier }: { dossier: CommuneDossier }) {
  const { identity, maire, population, parlement, coverage } = dossier;
  const departmentCode = identity.department.code;
  const hasOutline = Object.prototype.hasOwnProperty.call(DEPARTMENT_OUTLINES, departmentCode);
  const hasInset = Object.prototype.hasOwnProperty.call(
    FRANCE_MINI_OUTLINE.departments,
    departmentCode
  );
  const available = availableInformation(coverage);
  const postal = identity.postalCodes;

  return (
    <header className="text-white" style={{ backgroundColor: BRAND_NAVY }}>
      <div className="flex h-1" aria-hidden="true">
        <div className="flex-1" style={{ backgroundColor: BRAND_NAVY }} />
        <div className="flex-1" style={{ backgroundColor: BRAND_PAGE }} />
        <div className="flex-1" style={{ backgroundColor: BRAND_RED }} />
      </div>
      <div className="container mx-auto max-w-6xl px-4 py-5 md:py-8">
        <div className="flex gap-8">
          <div className="min-w-0 flex-1">
            <HeroBreadcrumb crumbs={crumbsFor(identity)} />

            <p className="mt-3 inline-flex rounded-full border border-white/40 px-3 py-1 text-xs font-semibold">
              {natureLabel(identity)} · {territoireLabel(identity)}
            </p>
            <h1 className="mt-2 break-words font-display text-3xl font-extrabold tracking-tight md:text-5xl">
              {identity.name}
            </h1>
            <p className="mt-2 text-sm text-white/85 md:text-base">
              Code INSEE {identity.inseeCode}
              {postal.length > 0 && (
                <>
                  {" · "}
                  {postal.length > 1 ? "codes postaux " : "code postal "}
                  {postal.length > 4
                    ? `${postal.slice(0, 3).join(", ")} et ${postal.length - 3} autres`
                    : postal.join(", ")}
                </>
              )}
              {identity.territoireHorsRegion && (
                <>
                  {" · "}
                  {identity.territoireHorsRegion.statut} hors région
                </>
              )}
            </p>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MaireFact maire={maire} />
              <Fact
                label="Population"
                value={
                  population.value != null ? formatPopulation(population.value) : "Non disponible"
                }
                detail={
                  population.value == null ? (
                    "Aucune population enregistrée pour cette commune."
                  ) : population.vintage ? (
                    <a
                      href={population.vintage.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-white"
                    >
                      {populationVintageLabel(population.vintage)}
                      <span className="sr-only"> (nouvel onglet)</span>
                    </a>
                  ) : (
                    "Source INSEE via geo.api.gouv.fr"
                  )
                }
              />
              <ParlementFact deputes={parlement.deputes} />
            </dl>

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
              <Link
                href={TERRITOIRES_PATH}
                prefetch={false}
                className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                style={{ color: BRAND_NAVY }}
              >
                Changer de commune
              </Link>
              {available.length > 0 && (
                <p className="text-xs text-white/85">
                  Informations disponibles : {available.join(", ")}.
                </p>
              )}
            </div>
          </div>

          {hasOutline && (
            <div className="relative hidden w-64 shrink-0 self-center md:block lg:w-72">
              <TerritoryShape
                kind="departement"
                code={departmentCode}
                marker={identity.coordinates}
                tone="marine"
              />
              {hasInset && (
                <div className="absolute -right-2 -top-4 w-20">
                  <TerritoryShape
                    kind="france"
                    size="mini"
                    highlightDepartment={departmentCode}
                    tone="marine"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/** TAAF districts and Clipperton carry a commune code in the COG without being communes. */
function natureLabel(identity: CommuneDossier["identity"]): string {
  const code = identity.territoireHorsRegion?.code;
  if (code === "984") return "District";
  if (code === "989") return "Territoire";
  return "Commune";
}
