import type { DepartementTerritoire } from "@/lib/data/territoires";
import type { PhraseSegment } from "@/lib/territoires/commune-bandeau";

/**
 * Answer sentence of the department banner, built by fixed templates from structured fields.
 * `remplace` says that a collectivité exercises the departmental competences in place of a
 * departmental council (Paris, Corse, Alsace, Guyane, Martinique): no council is then named.
 */
export function departementPhraseReponse(
  territoire: Pick<
    DepartementTerritoire,
    "presidence" | "territoireHorsRegion" | "collectivitesParticulieres"
  >,
  remplace: boolean
): PhraseSegment[] {
  const { presidence, territoireHorsRegion, collectivitesParticulieres } = territoire;
  if (territoireHorsRegion) {
    return [{ text: `${territoireHorsRegion.statut}, hors de toute région.` }];
  }
  const noms = [...new Set(collectivitesParticulieres.map((c) => c.collectivite))].join(", ");
  // The legal note is displayed further down the page and is not copied here.
  const note: PhraseSegment[] = [{ text: "Voir la note", href: "#collectivite" }, { text: "." }];
  if (remplace) return [{ text: `Collectivité compétente : ${noms}. ` }, ...note];

  const segments: PhraseSegment[] = [];
  if (presidence.state === "ETABLI" && presidence.person) {
    segments.push(
      { text: presidence.person.fullName, href: `/politiques/${presidence.person.slug}` },
      { text: " préside le conseil départemental." }
    );
  } else if (presidence.registre) {
    // A name from the register only: never linked to a profile.
    segments.push({
      text: `${presidence.registre.fullName} préside le conseil départemental, d'après le registre national des élus.`,
    });
  } else {
    segments.push({
      text: "La présidence du conseil départemental n'est pas établie dans nos données.",
    });
  }
  if (noms) segments.push({ text: ` Collectivité à statut particulier : ${noms}. ` }, ...note);
  return segments;
}

/** "Aucun" rather than a zero: an empty count is said in words. */
export function compteEnMots(
  n: number,
  singulier: string,
  pluriel = `${singulier}s`
): { valeur: string; nom: string } {
  if (n === 0) return { valeur: "Aucun", nom: singulier };
  return { valeur: n.toLocaleString("fr-FR").replace(/ /g, " "), nom: n > 1 ? pluriel : singulier };
}
