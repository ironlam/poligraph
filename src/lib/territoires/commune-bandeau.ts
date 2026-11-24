import type { CommuneDossier } from "@/lib/data/territoires";
import { deputeNoun, formatCirconscription, maireSince } from "@/lib/territoires/commune-display";
import { formatDate } from "@/lib/utils";

/**
 * Wording of the commune banner, built from structured fields of the dossier by fixed templates,
 * never by a language model. Pure, so every state is tested without rendering.
 */

/** A piece of the answer sentence; `href` makes it a link (the mayor's profile). */
export interface PhraseSegment {
  text: string;
  href?: string;
}

/**
 * Answer sentence. No one is named unless the mayor is established: a person present by mistake
 * in a block that is not ETABLI stays out. "Est maire" rather than "dirigée par", which would
 * need an agreement with "commune" (wrong for the TAAF districts and Clipperton).
 */
export function communePhraseReponse(dossier: CommuneDossier): PhraseSegment[] {
  const { maire, identity } = dossier;
  const segments: PhraseSegment[] = [];
  if (maire.state === "ETABLI" && maire.person) {
    const since = maireSince(maire);
    segments.push(
      { text: maire.person.fullName, href: `/politiques/${maire.person.slug}` },
      { text: since ? ` est maire depuis le ${formatDate(since)}.` : " est maire." }
    );
  } else if (maire.state === "NON_ETABLI") {
    segments.push({
      text: "Titulaire non établi : les données enregistrées ne permettent pas de désigner le maire avec certitude.",
    });
  } else {
    segments.push({ text: "Aucun maire en fonction n'est enregistré." });
  }
  // The note itself is displayed further down the page and is not copied here.
  if (identity.collectivitesParticulieres.length > 0) {
    segments.push({ text: " Statut particulier : voir la note plus bas." });
  }
  return segments;
}

export interface FaitParlement {
  valeur: string;
  /** Abbreviated value for a phone, the full one staying available to screen readers. */
  valeurCourte: string;
  legende: string;
}

/** Third fact of the banner. A deputy is named only when established as the commune's own. */
export function communeFaitParlement(
  deputes: CommuneDossier["parlement"]["deputes"]
): FaitParlement {
  if (deputes.couvertureCirconscriptions === "PLUSIEURS") {
    return {
      valeur: "Plusieurs circonscriptions",
      valeurCourte: "Plusieurs circ.",
      legende: "Le député dépend de l'adresse.",
    };
  }
  const circo = deputes.circonscriptionEnregistree;
  if (circo == null) {
    return {
      valeur: "Circonscription non renseignée",
      valeurCourte: "Non renseignée",
      legende: "La circonscription dépend de l'adresse.",
    };
  }
  const valeurCourte = `${circo === 1 ? "1re" : `${circo}e`} circ.`;
  const depute = deputes.state === "DISPONIBLE" ? deputes.deputes[0] : undefined;
  if (!depute) {
    return {
      valeur: `${formatCirconscription(circo)} enregistrée`,
      valeurCourte,
      legende: "Selon l'adresse, vérifiez avec Mon député.",
    };
  }
  const noun = deputeNoun(depute.civility);
  return {
    valeur: formatCirconscription(circo),
    valeurCourte,
    legende: noun
      ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} : ${depute.fullName}`
      : `À l'Assemblée nationale : ${depute.fullName}`,
  };
}
