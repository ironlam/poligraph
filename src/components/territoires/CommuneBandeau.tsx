import { DEPARTMENT_OUTLINES, FRANCE_MINI_OUTLINE } from "@/config/territoires-shapes";
import { TerritoireBandeau, type BandeauFait } from "@/components/territoires/TerritoireBandeau";
import { TerritoryShape } from "@/components/territoires/TerritoryShape";
import type { CommuneDossier } from "@/lib/data/territoires";
import { communeFaitParlement, communePhraseReponse } from "@/lib/territoires/commune-bandeau";
import { formatCount, territoireLabel } from "@/lib/territoires/commune-display";
import {
  TERRITOIRES_PATH,
  territoireCommunePath,
  territoireDepartementPath,
  territoireRegionPath,
} from "@/lib/territoires/paths";
import { populationVintageLabel } from "@/lib/territoires/population-label";
import { formatDate, formatDateShort } from "@/lib/utils";

/** Thin adapter: translates a `CommuneDossier` into the props of `TerritoireBandeau`. */
const has = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

function filAriane(identity: CommuneDossier["identity"]) {
  const { department, region, inseeCode } = identity;
  return [
    { label: "Territoires", href: TERRITOIRES_PATH },
    ...(region
      ? [{ label: region.name, href: territoireRegionPath(region.slug) }]
      : identity.territoireHorsRegion
        ? [{ label: "Outre-mer" }]
        : []),
    {
      label: territoireLabel(identity),
      href: department.slug ? territoireDepartementPath(department.slug) : undefined,
    },
    { label: identity.name, href: territoireCommunePath(inseeCode) },
  ];
}

/** The INSEE code and the postal codes stay written in text; the large figure is decoration. */
function identite(identity: CommuneDossier["identity"]): string {
  const postal = identity.postalCodes;
  const horsRegion = identity.territoireHorsRegion;
  // TAAF districts and Clipperton carry a commune code in the COG without being communes.
  const nature =
    horsRegion?.code === "984" ? "District" : horsRegion?.code === "989" ? "Territoire" : "Commune";
  const parts = [`${nature} · Code INSEE ${identity.inseeCode}`];
  if (postal.length > 0) {
    const list =
      postal.length > 4
        ? `${postal.slice(0, 3).join(", ")} et ${postal.length - 3} autres`
        : postal.join(", ");
    parts.push(`${postal.length > 1 ? "codes postaux" : "code postal"} ${list}`);
  }
  if (horsRegion) parts.push(`${horsRegion.statut} hors région`);
  return parts.join(" · ");
}

function faits(dossier: CommuneDossier): BandeauFait[] {
  const { population, conseilMunicipal: conseil, parlement } = dossier;
  const habitants = (population.value ?? 0) > 1 ? "habitants" : "habitant";
  const { vintage } = population;
  const registre = conseil.registerDate;
  return [
    population.value == null
      ? {
          label: "Population",
          valeur: "Non disponible",
          legende: "Aucune population n'est enregistrée.",
        }
      : {
          label: "Population",
          valeur: formatCount(population.value),
          legende: vintage
            ? `${habitants}. ${populationVintageLabel(vintage)}`
            : `${habitants}, source INSEE via geo.api.gouv.fr`,
          legendeCourte: vintage
            ? `${habitants} en ${vintage.millesime} (${vintage.producer})`
            : `${habitants} (INSEE)`,
          sourceHref: vintage?.sourceUrl ?? population.source.url ?? undefined,
        },
    conseil.state === "DISPONIBLE" && conseil.recordedCount > 0
      ? {
          label: "Conseil municipal",
          valeur: formatCount(conseil.recordedCount),
          legende: `élus au conseil municipal${conseil.source ? `. ${conseil.source.label}` : ""}${registre ? `, registre du ${formatDate(registre)}` : ""}`,
          legendeCourte: `élus au conseil${registre ? `, registre du ${formatDateShort(registre)}` : ""}`,
          sourceHref: conseil.source?.url ?? undefined,
        }
      : {
          label: "Conseil municipal",
          valeur: "Non établi",
          legende: "Aucun élu du conseil municipal n'est enregistré.",
          legendeCourte: "Conseil municipal : aucun élu enregistré.",
        },
    { label: "Parlement", ...communeFaitParlement(parlement.deputes) },
  ];
}

export function CommuneBandeau({ dossier }: { dossier: CommuneDossier }) {
  const { identity, maire } = dossier;
  const departmentCode = identity.department.code;
  return (
    <TerritoireBandeau
      titreId="commune-titre"
      filAriane={filAriane(identity)}
      nom={identity.name}
      code={identity.inseeCode}
      identite={identite(identity)}
      phrase={communePhraseReponse(dossier)}
      source={
        maire.state === "ETABLI" && maire.source ? `Source : ${maire.source.label}` : undefined
      }
      faits={faits(dossier)}
      action={{ label: "Changer de commune", href: TERRITOIRES_PATH }}
      silhouette={
        has(DEPARTMENT_OUTLINES, departmentCode) && (
          <div className="relative hidden w-64 shrink-0 self-center md:block lg:w-72">
            <TerritoryShape
              kind="departement"
              code={departmentCode}
              marker={identity.coordinates}
              tone="marine"
            />
            {has(FRANCE_MINI_OUTLINE.departments, departmentCode) && (
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
        )
      }
    />
  );
}
