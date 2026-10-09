/**
 * Gel du sync gouvernement pendant la migration des gouvernements.
 * Tant que cette constante vaut true, syncGouvernement() (et donc
 * applyLocalCorrections) n'écrit rien, sauf option explicite
 * allowDuringGovernmentMigration. Ne pas importer @/lib/db ici.
 */
export const GOVERNMENT_SYNC_FROZEN = true;
