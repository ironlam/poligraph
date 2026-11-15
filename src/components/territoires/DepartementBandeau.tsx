import { DEPARTMENT_OUTLINES, FRANCE_MINI_OUTLINE } from "@/config/territoires-shapes";
import { remplaceLeDepartement } from "@/components/territoires/DepartementConseil";
import { TerritoireBandeau, type BandeauFait } from "@/components/territoires/TerritoireBandeau";
import { TerritoryShape } from "@/components/territoires/TerritoryShape";
import type { DepartementTerritoire } from "@/lib/data/territoires";
import { compteEnMots, departementPhraseReponse } from "@/lib/territoires/departement-bandeau";
import {
  TERRITOIRES_PATH,
  territoireDepartementPath,
  territoireRegionPath,
} from "@/lib/territoires/paths";
import { formatDate } from "@/lib/utils";

interface DepartementBandeauProps {
  slug: string;
  name: string;
  code: string;
  territoire: DepartementTerritoire;
  deputeCount: number;
  senateurCount: number;
}

/** Thin adapter: translates a `DepartementTerritoire` into the props of `TerritoireBandeau`. */
export function DepartementBandeau(props: DepartementBandeauProps) {
  const { slug, name, code, territoire } = props;
  const { region, territoireHorsRegion } = territoire;
  const communesDate = territoire.coverage.find((c) => c.bloc === "communes")?.date ?? null;
  const communes = compteEnMots(territoire.communeCount, "commune");
  const deputes = compteEnMots(props.deputeCount, "député");
  const senateurs = compteEnMots(props.senateurCount, "sénateur");
  const enCours = (nom: string, n: number) =>
    n === 0 ? `${nom} enregistré` : `${nom}, mandat${n > 1 ? "s" : ""} en cours`;

  const faits: BandeauFait[] = [
    {
      label: "Communes",
      valeur: communes.valeur,
      legende: `${communes.nom}. COG INSEE${communesDate ? `, import du ${formatDate(communesDate)}` : ""}`,
      legendeCourte: `${communes.nom} (COG INSEE)`,
    },
    {
      label: "Députés",
      valeur: deputes.valeur,
      legende: enCours(deputes.nom, props.deputeCount),
    },
    {
      label: "Sénateurs",
      valeur: senateurs.valeur,
      legende: enCours(senateurs.nom, props.senateurCount),
    },
  ];

  return (
    <TerritoireBandeau
      titreId="departement-titre"
      filAriane={[
        { label: "Territoires", href: TERRITOIRES_PATH },
        ...(region ? [{ label: region.name, href: territoireRegionPath(region.slug) }] : []),
        { label: `${name} (${code})`, href: territoireDepartementPath(slug) },
      ]}
      nom={name}
      code={code}
      identite={
        territoireHorsRegion
          ? `${territoireHorsRegion.statut} · code ${code}`
          : `Département · code ${code}${region ? ` · ${region.name}` : ""}`
      }
      phrase={departementPhraseReponse(
        territoire,
        remplaceLeDepartement(territoire.collectivitesParticulieres)
      )}
      faits={faits}
      silhouette={
        Object.hasOwn(DEPARTMENT_OUTLINES, code) && (
          <div
            aria-hidden="true"
            className="relative hidden w-64 shrink-0 self-center md:block lg:w-72"
          >
            <TerritoryShape kind="departement" code={code} tone="marine" />
            {Object.hasOwn(FRANCE_MINI_OUTLINE.departments, code) && (
              <div className="absolute -right-2 -top-4 w-20">
                <TerritoryShape
                  kind="france"
                  size="mini"
                  highlightDepartment={code}
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
