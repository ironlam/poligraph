/**
 * Gel du sync gouvernement pendant la migration des gouvernements.
 * Tant que cette constante vaut true, syncGouvernement() (et donc
 * applyLocalCorrections) n'écrit rien, sauf option explicite
 * allowDuringGovernmentMigration. Ne pas importer @/lib/db ici.
 */
export const GOVERNMENT_SYNC_FROZEN = true;

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
