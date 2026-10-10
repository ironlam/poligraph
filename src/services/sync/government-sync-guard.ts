/**
 * Gel du sync gouvernement (mécanisme conservé pour un futur gel).
 * Tant que cette constante vaut true, syncGouvernement() n'écrit rien,
 * sauf option explicite allowDuringGovernmentMigration. Levé : le sync est durci
 * (pas de clôture implicite, pas de création de personne, fonctions vérifiées par
 * acte intactes, sources périmées ignorées). Ne pas importer @/lib/db ici.
 */
export const GOVERNMENT_SYNC_FROZEN = false;

const GOVERNMENT_FUNCTION_TYPES: readonly string[] = [
  "PREMIER_MINISTRE",
  "MINISTRE",
  "MINISTRE_DELEGUE",
  "SECRETAIRE_ETAT",
];

/** Vrai pour un type de mandat qui est une fonction gouvernementale. */
export function isGovernmentFunctionType(type: string): boolean {
  return GOVERNMENT_FUNCTION_TYPES.includes(type);
}
