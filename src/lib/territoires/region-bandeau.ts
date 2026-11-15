import type { RegionTerritoire } from "@/lib/data/territoires";
import type { PhraseSegment } from "@/lib/territoires/commune-bandeau";

/**
 * Answer sentence of the region banner, built by fixed templates from structured fields. Where a
 * single collectivité holds the regional powers (Corse, Guyane, Martinique, Mayotte) no body is
 * called "conseil régional": the sentence says "la collectivité" and points to its note.
 */
export function regionPhraseReponse(
  data: Pick<RegionTerritoire, "presidence" | "collectivitesParticulieres">
): PhraseSegment[] {
  const { presidence, collectivitesParticulieres } = data;
  const particuliere = collectivitesParticulieres.length > 0;
  const organe = particuliere ? "la collectivité" : "le conseil régional";
  const segments: PhraseSegment[] = [];
  if (presidence.state === "ETABLI" && presidence.person) {
    segments.push(
      { text: presidence.person.fullName, href: `/politiques/${presidence.person.slug}` },
      { text: ` préside ${organe}.` }
    );
  } else if (presidence.registre) {
    // A name from the register only: never linked to a profile.
    segments.push({
      text: `${presidence.registre.fullName} préside ${organe}, d'après le registre national des élus.`,
    });
  } else {
    segments.push({ text: "La présidence n'est pas établie dans nos données." });
  }
  if (particuliere) {
    const noms = [...new Set(collectivitesParticulieres.map((c) => c.collectivite))].join(", ");
    // The legal note is displayed further down the page and is not copied here.
    segments.push(
      { text: ` Collectivité compétente : ${noms}. ` },
      { text: "Voir la note", href: "#collectivite" },
      { text: "." }
    );
  }
  return segments;
}
