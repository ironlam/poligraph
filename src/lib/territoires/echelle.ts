import {
  getCollectivitesForDepartment,
  getCollectivitesForRegion,
} from "@/config/collectivites-particulieres";
import { TERRITOIRES_SANS_COMMUNE } from "@/config/regions";
import { COMPETENCES_TERRITOIRES, type NiveauTerritoire } from "@/config/territoires-competences";
import type { CommuneDossier } from "@/lib/data/territoires";
import { territoireLabel } from "@/lib/territoires/commune-display";
import { territoireDepartementPath, territoireRegionPath } from "@/lib/territoires/paths";

/** One rung of the « échelle des territoires »: a level, the body at that level, what it does. */
export interface Barreau {
  niveau: NiveauTerritoire;
  /** "Commune", "Intercommunalité"... or the status of a territory outside the common scheme. */
  titre: string;
  nom: string;
  /** Page of the body; none for the page being read and for bodies without a page. */
  href?: string;
  /** Null where the ordinary line would be wrong: a particular status, said in `titre`. */
  competences: string | null;
  ici: boolean;
}

const STATUT_PARTICULIER = "statut particulier, voir sa page";

/**
 * Rungs for a commune page, from the commune up. The ordinary competences of a level are given
 * only where the common regime applies: not in a territory outside any region (commune included),
 * nor for a department or region whose powers a particular collectivité exercises.
 */
export function echelleCommune(dossier: CommuneDossier): Barreau[] {
  const { identity, intercommunalite } = dossier;
  const { department, region, territoireHorsRegion: horsRegion } = identity;
  const sansCommune = TERRITOIRES_SANS_COMMUNE.has(horsRegion?.code ?? "");
  const barreaux: Barreau[] = [
    {
      niveau: "commune",
      titre: sansCommune ? "Territoire sans commune" : "Commune",
      nom: identity.name,
      // The line describes the common regime: the communes of the overseas collectivités
      // outside any region follow their own statute, so nothing is asserted for them.
      competences: horsRegion ? null : COMPETENCES_TERRITOIRES.commune,
      ici: true,
    },
  ];
  if (intercommunalite?.state === "DISPONIBLE") {
    for (const body of intercommunalite.intercommunalites) {
      // The Métropole de Lyon is a collectivité, not an intercommunalité: its note says so.
      if (body.nature === "MET69") continue;
      barreaux.push({
        niveau: "intercommunalite",
        titre: "Intercommunalité",
        nom: body.name,
        competences: COMPETENCES_TERRITOIRES.intercommunalite,
        ici: false,
      });
    }
  }
  if (department.name || horsRegion) {
    const particulier = getCollectivitesForDepartment(department.code).length > 0;
    barreaux.push({
      niveau: "departement",
      titre: horsRegion
        ? horsRegion.statut
        : particulier
          ? `Département, ${STATUT_PARTICULIER}`
          : "Département",
      nom: territoireLabel(identity),
      href: department.slug ? territoireDepartementPath(department.slug) : undefined,
      competences: horsRegion || particulier ? null : COMPETENCES_TERRITOIRES.departement,
      ici: false,
    });
  }
  if (region) {
    const particulier = getCollectivitesForRegion(region.code).length > 0;
    barreaux.push({
      niveau: "region",
      titre: particulier ? `Région, ${STATUT_PARTICULIER}` : "Région",
      nom: region.name,
      href: territoireRegionPath(region.slug),
      competences: particulier ? null : COMPETENCES_TERRITOIRES.region,
      ici: false,
    });
  }
  return barreaux;
}
