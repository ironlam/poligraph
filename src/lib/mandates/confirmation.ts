/**
 * Quand une source a affirmé pour la dernière fois qu'un mandat était détenu.
 *
 * Deux sortes de sources, deux réponses différentes, et les confondre serait réécrire l'erreur
 * que la Phase 3 du sync RNE a commise en horodatant des fermetures à la milliseconde où le
 * script passait.
 *
 * Une API interrogée en direct (Assemblée nationale, Sénat, gouvernement, Parlement européen)
 * répond sur le présent : la date du sync EST la date de confirmation.
 *
 * Un fichier publié, comme le registre national des élus, affirme à sa date de PUBLICATION. Le
 * lire six semaines plus tard ne rend pas son contenu plus récent. Prendre la date du run
 * ferait croire qu'un registre d'août parle de septembre, et c'est précisément la comparaison
 * dont dépend la résolution des cumuls.
 */

/** Une source interrogée en direct confirme au moment où on l'interroge. */
export function confirmedNow(): Date {
  return new Date();
}

/**
 * La date de publication portée par l'URL d'une ressource data.gouv.
 *
 * Les ressources du RNE sont servies sous `.../20260811-155100/elus-maire-mai.csv`. Rendre
 * `null` plutôt qu'une date inventée quand le motif change : une date fausse serait pire que
 * pas de date, puisqu'elle serait comparée.
 */
export function confirmedFromResourceUrl(url: string): Date | null {
  const stamp = url.match(/\/(\d{4})(\d{2})(\d{2})-\d+\//);
  if (!stamp) return null;

  const date = new Date(`${stamp[1]}-${stamp[2]}-${stamp[3]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
