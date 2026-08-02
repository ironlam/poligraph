/**
 * Qui a validé un rattachement : un humain, ou une passe assistée ?
 *
 * `AffairPoliticianDecision.reviewedBy` est un texte libre, et il a longtemps porté une
 * seule valeur, `admin`. Depuis la passe de triage de juillet il en porte deux, et
 * `auto-triage` y compte pour 159 revues contre 72 humaines. La garde de publication
 * testait `reviewedBy !== null` tout en annonçant « non validée par un humain » : trois
 * affaires publiées reposent sur un rattachement que seule la machine a confirmé.
 *
 * L'assistance est légitime et reste la seule façon de tenir le rythme à une personne.
 * Ce qui ne l'est pas, c'est qu'une garde promette une chose et en vérifie une autre.
 */

/**
 * Les identités humaines connues, énumérées explicitement.
 *
 * Le sens de la liste est délibéré : **tout ce qui n'y figure pas est considéré comme
 * assisté**. Ajouter un nouveau réviseur automatique ne demande donc aucune modification
 * ici et reste sûr par défaut. Oublier d'y déclarer un nouvel humain a pour seule
 * conséquence que ses validations ne débloquent pas une publication, ce qui bloque au
 * lieu de publier.
 *
 * L'inverse, une liste des robots où l'inconnu vaudrait humain, laisserait un réviseur
 * automatique ajouté demain publier sans que personne le décide.
 */
export const HUMAN_REVIEWERS: readonly string[] = ["admin"];

export type ReviewProvenance = "HUMAN" | "ASSISTED" | "NONE";

export function reviewProvenance(reviewedBy: string | null | undefined): ReviewProvenance {
  if (!reviewedBy) return "NONE";
  return HUMAN_REVIEWERS.includes(reviewedBy) ? "HUMAN" : "ASSISTED";
}

/** Raccourci de lecture pour les gardes. Ne dit rien de la qualité de la revue. */
export function isHumanReview(reviewedBy: string | null | undefined): boolean {
  return reviewProvenance(reviewedBy) === "HUMAN";
}
