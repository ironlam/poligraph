import {
  getCollectivitesForDepartment,
  getCollectivitesForRegion,
} from "@/config/collectivites-particulieres";
import { TERRITOIRES_SANS_COMMUNE } from "@/config/regions";
import {
  COMPETENCES_GRAND_PARIS,
  COMPETENCES_TERRITOIRES,
  type NiveauTerritoire,
} from "@/config/territoires-competences";
import type { CommuneDossier } from "@/lib/data/territoires";
import { territoireLabel } from "@/lib/territoires/commune-display";
import {
  territoireCommuneBudgetPath,
  territoireDepartementBudgetPath,
  territoireDepartementPath,
  territoireRegionBudgetPath,
  territoireRegionPath,
} from "@/lib/territoires/paths";
import type { RepereTerritoryKind } from "@/config/territoire-reperes";

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
  /** Its /budget sub-page, only while that page exists (accounts published). */
  comptesHref?: string;
}

/** What the commune page knows of the accounts: its own, and the scales already published. */
export interface EchelleComptes {
  commune: boolean;
  echelles: readonly RepereTerritoryKind[];
}

const STATUT_PARTICULIER = "statut particulier, voir sa page";
const GRAND_PARIS_SIREN = "200054781";

/**
 * Rungs for a commune page, from the commune up. The ordinary competences of a level are given
 * only where the common regime applies: not in a territory outside any region (commune included),
 * nor for a department or region whose powers a particular collectivité exercises.
 */
export function echelleCommune(dossier: CommuneDossier, comptes?: EchelleComptes): Barreau[] {
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
      comptesHref: comptes?.commune
        ? territoireCommuneBudgetPath(identity.inseeCode, identity.name)
        : undefined,
    },
  ];
  if (intercommunalite?.state === "DISPONIBLE") {
    const bodies = intercommunalite.intercommunalites;
    // The Métropole du Grand Paris (alone in Paris, with an EPT elsewhere) and the EPT split
    // between them what one intercommunalité holds elsewhere.
    const grandParis = bodies.some((b) => b.nature === "EPT" || b.siren === GRAND_PARIS_SIREN);
    for (const body of bodies) {
      // The Métropole de Lyon is a collectivité, not an intercommunalité: its note says so.
      if (body.nature === "MET69") continue;
      barreaux.push({
        niveau: "intercommunalite",
        titre: "Intercommunalité",
        nom: body.name,
        competences: grandParis
          ? COMPETENCES_GRAND_PARIS
          : COMPETENCES_TERRITOIRES.intercommunalite,
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
      comptesHref:
        department.slug && !horsRegion && comptes?.echelles.includes("DEP")
          ? territoireDepartementBudgetPath(department.slug)
          : undefined,
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
      comptesHref: comptes?.echelles.includes("REG")
        ? territoireRegionBudgetPath(region.slug)
        : undefined,
    });
  }
  return barreaux;
}
