/**
 * « Est-ce la bonne personne ? », sans demander si elle est impliquée.
 *
 * `AffairCombiner` répond à deux questions dans un seul verdict : la personne
 * est-elle la bonne, ET un signal autre que le nom la relie-t-il à cette
 * affaire. Sa porte « name-only » transforme une identité parfaite en NO_MATCH
 * quand aucun signal corroborant ne se déclenche.
 *
 * Cette porte est juste pour l'analyse de presse sur des articles quelconques,
 * où « X a réagi à l'affaire Y » inonderait la file de revue. Elle est fausse
 * pour un appelant qui a déjà établi l'implication autrement.
 *
 * Mesuré sur la découverte web : un titre nommant quelqu'un en toutes lettres
 * score 5,7 à 6,2 avec un écart supérieur à 7 sur le second candidat, et
 * ressort quand même NO_MATCH, un titre de presse ne portant ni juridiction,
 * ni date des faits, ni parti, ni fonction.
 *
 * N'UTILISER QUE là où l'implication est établie ailleurs. Ce prédicat saute
 * délibérément la corroboration : employé seul, il réadmettrait exactement les
 * mentions incidentes que cette porte existe pour écarter.
 */
import { SAME_THRESHOLD, MIN_GAP } from "./signals/constants";

export interface IdentityConfidenceInput {
  topCandidateId: string | null;
  topScore: number;
  gap: number;
}

export function isIdentityConfident(
  result: IdentityConfidenceInput,
  expectedPoliticianId: string
): boolean {
  // Le resolver a classé quelqu'un d'autre en tête : c'est un homonyme, et
  // c'est précisément ce que cette vérification doit attraper.
  if (result.topCandidateId !== expectedPoliticianId) return false;

  // Les seuils du combineur, pas des nôtres : deux barres concurrentes pour la
  // même question finiraient par diverger.
  return result.topScore >= SAME_THRESHOLD && result.gap >= MIN_GAP;
}
