import { TerritoireBandeau, type BandeauFait } from "@/components/territoires/TerritoireBandeau";
import { TerritoryShape } from "@/components/territoires/TerritoryShape";
import type { RegionTerritoire } from "@/lib/data/territoires";
import { compteEnMots } from "@/lib/territoires/departement-bandeau";
import {
  TERRITOIRES_PATH,
  territoireDepartementPath,
  territoireRegionPath,
} from "@/lib/territoires/paths";
import { regionPhraseReponse } from "@/lib/territoires/region-bandeau";

/** Thin adapter: translates a `RegionTerritoire` into the props of `TerritoireBandeau`. */
export function RegionBandeau({ data }: { data: RegionTerritoire }) {
  const { region, departements } = data;
  const departementPathByCode = new Map(
    departements.flatMap((d) =>
      d.slug ? [[d.code, territoireDepartementPath(d.slug)] as const] : []
    )
  );
  const parlementaires = departements.reduce((n, d) => n + d.deputeCount + d.senateurCount, 0);
  const comptes = {
    departements: compteEnMots(departements.length, "département"),
    communes: compteEnMots(data.communeCount, "commune"),
    parlementaires: compteEnMots(parlementaires, "parlementaire"),
  };
  const faits: BandeauFait[] = [
    {
      label: "Départements",
      valeur: comptes.departements.valeur,
      legende: `${comptes.departements.nom}. ${region.source.label}`,
      legendeCourte: comptes.departements.nom,
    },
    {
      label: "Communes",
      valeur: comptes.communes.valeur,
      legende: `${comptes.communes.nom}. ${region.source.label}`,
      legendeCourte: comptes.communes.nom,
    },
    {
      label: "Parlementaires",
      valeur: comptes.parlementaires.valeur,
      legende:
        parlementaires === 0
          ? "parlementaire enregistré"
          : "députés et sénateurs, mandats en cours",
    },
  ];

  return (
    <TerritoireBandeau
      titreId="region-titre"
      filAriane={[
        { label: "Territoires", href: TERRITOIRES_PATH },
        { label: region.name, href: territoireRegionPath(region.slug) },
      ]}
      nom={region.name}
      code={region.code}
      identite={`Région · code ${region.code} · chef-lieu : ${region.chefLieu.name}`}
      phrase={regionPhraseReponse(data)}
      faits={faits}
      silhouette={
        <div className="hidden w-56 shrink-0 self-center md:block lg:w-64 [&_svg]:max-h-64">
          {/* Decorative mouse shortcut with the department name on hover; the list is below. */}
          <TerritoryShape
            kind="region"
            region={region.name}
            tone="marine"
            departementHref={(code) => departementPathByCode.get(code)}
          />
        </div>
      }
    />
  );
}
